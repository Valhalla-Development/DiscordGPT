import type { ArgsOf, Client } from 'discordx';
import { Discord, On } from 'discordx';
import {
    ChannelType,
    codeBlock,
    EmbedBuilder,
    GuildTextBasedChannel,
    Message,
    PublicThreadChannel,
    ThreadAutoArchiveDuration,
    User,
} from 'discord.js';
import { runGPT } from '../utils/Util.js';

@Discord()
export class MessageCreate {
    private readonly threadsEnabled: boolean;

    private readonly commandUsageChannel?: string;

    private allowedServers: string[];

    private excludedChannels: Set<string>;

    private readonly supportServerInvite?: string;

    constructor() {
        this.threadsEnabled = process.env.ENABLE_MESSAGE_THREADS === 'true';
        this.commandUsageChannel = process.env.COMMAND_USAGE_CHANNEL;
        this.allowedServers = process.env.ALLOWED_SERVER_IDS?.split(',').map((id) => id.trim()) || [];
        this.excludedChannels = new Set(process.env.EXCLUDED_CHANNEL_IDS?.split(',').map((id) => id.trim()) || []);
        this.supportServerInvite = process.env.SUPPORT_SERVER_INVITE;
    }

    @On({ event: 'messageCreate' })
    async onMessage([message]: ArgsOf<'messageCreate'>, client: Client) {
        if (message.author.bot) return;

        if (!message.guild) {
            await this.handleDirectMessage(message, client);
            return;
        }

        if (!this.isServerAllowed(message.guild.id)) return;

        if (this.threadsEnabled) {
            const handled = await this.manageThreadsIfNeeded(message, client);
            if (handled) return;
        }

        if (this.shouldRespond(message, client)) {
            await this.handleGPTResponse(message.content, message.author, message, client);
            return;
        }

        if (message.reference) {
            await this.handleRepliedMessage(message, client);
        } else if (message.mentions.has(client.user!.id)) {
            await this.handleGPTResponse(message.content, message.author, message, client);
        }
    }

    private isServerAllowed(guildId: string): boolean {
        if (this.allowedServers.length === 0) return true;
        return this.allowedServers.includes(guildId);
    }

    private async handleDirectMessage(message: Message, client: Client) {
        if (process.env.ENABLE_DIRECT_MESSAGES === 'true') {
            await this.handleGPTResponse(message.content, message.author, message, client);
        } else {
            const replyMsg = this.supportServerInvite
                ? `[${client.user?.username} Discord server](${this.supportServerInvite})`
                : `**${client.user?.username} Discord server**`;

            const embed = new EmbedBuilder()
                .setColor('#EC645D')
                .addFields([
                    {
                        name: `**${client.user?.username}**`,
                        value: `To better assist you, please use our bot within the ${replyMsg}.\nHead over there for a seamless experience. See you on the server!`,
                    },
                ]);

            await message.reply({ embeds: [embed] });
        }
    }

    private shouldRespond(message: Message, client: Client): boolean {
        if (this.excludedChannels.has(message.channel.id)) return false;

        if (message.mentions.users.size > 0 && !message.mentions.users.has(client.user!.id)) return false;

        const chance = Math.random();
        const isQuestion = /^.{5,100}\?$/.test(message.content);
        const hasContent = message.content.replace(/<@!?(\d+)>/g, '').length > 0;
        const notAReply = !message.reference;

        return chance <= 0.04 && isQuestion && hasContent && notAReply;
    }

    private async manageThreadsIfNeeded(message: Message, client: Client): Promise<boolean> {
        if (!message.channel.isThread() && message.mentions.has(client.user!.id)) {
            const isReplyToAnotherUser = message.reference
                ? (await message.channel.messages.fetch(`${message.reference.messageId}`)).author.id !== client.user!.id
                : false;

            if (!isReplyToAnotherUser) {
                await this.handleThreadManagement(message, client);
                return true;
            }
        } else if (message.channel.isThread()) {
            const thread = message.channel as PublicThreadChannel;
            const threadName = thread.name;
            const threadOwnerName = threadName.match(/Conversation with (.+)/)?.[1];

            const isReplyToBot = message.reference
                ? (await message.channel.messages.fetch(`${message.reference.messageId}`)).author.id === client.user!.id
                : false;

            if (threadOwnerName && message.author.username !== threadOwnerName && (isReplyToBot || message.mentions.has(client.user!.id))) {
                let responseContent = 'Please create your own thread to interact with me.';

                if (this.commandUsageChannel) {
                    try {
                        const channel = await client.channels.fetch(this.commandUsageChannel);
                        if (channel?.isTextBased()) {
                            responseContent = `Please create your own thread to interact with me in ${channel}.`;
                        }
                    } catch {
                        // Do nothing
                    }
                }

                await message.reply({
                    content: responseContent,
                });
                return true;
            }
        }
        return false;
    }

    private async handleThreadManagement(message: Message, client: Client): Promise<void> {
        const { author } = message;
        const threadName = `Conversation with ${author.username}`;

        try {
            const activeThreads = await message.guild!.channels.fetchActiveThreads();
            const existingThread = Array.from(activeThreads.threads.values()).find(
                (thread) => thread.name === threadName && !thread.archived,
            );

            if (existingThread) {
                const threadUrl = `https://discord.com/channels/${message.guild!.id}/${existingThread.id}/${existingThread.id}`;
                await message.reply({
                    content: `You already have an active thread. Please submit your request here: ${threadUrl}.`,
                });
                return;
            }

            const contentStripped = message.content.replace(/<@!?(\d+)>/g, '').trim();
            if (contentStripped.length < 4) {
                await message.reply({ content: 'Please enter a valid query, with a minimum length of 4 characters.' });
                return;
            }

            const thread = await message.startThread({
                name: threadName,
                autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
                reason: `Thread created for conversation with ${author.tag}`,
            });

            const initialMessage = await thread.send({ content: 'Generating response...' });
            await this.handleGPTResponse(message.content, author, initialMessage, client, true);
        } catch (error) {
            console.error('Error creating thread:', error);
            await message.reply({
                content: 'Sorry, I couldn\'t create a thread. Please try again later or contact support.',
            });
        }
    }

    private async handleGPTResponse(
        content: string,
        user: User,
        msg: Message,
        client: Client,
        editInitial: boolean = false,
    ): Promise<void> {
        if (msg.channel.type === ChannelType.GuildText || msg.channel.type === ChannelType.PublicThread) await msg.channel.sendTyping();

        try {
            const response = await runGPT(content, user);

            if (typeof response === 'boolean') {
                if (response) {
                    await msg.reply({
                        content: `You currently have an ongoing request. Please refrain from sending additional queries to avoid spamming ${client.user}`,
                    });
                }
                return;
            }

            if (response === content.replace(/<@!?(\d+)>/g, '')) {
                await msg.reply({
                    content: `An error occurred, please report this to a member of our moderation team.\n${codeBlock('js', 'Error: Response was equal to query.')}`,
                });
                return;
            }

            if (Array.isArray(response)) {
                if (editInitial) {
                    await msg.edit({ content: response[0] });
                    await (msg.channel as GuildTextBasedChannel | PublicThreadChannel).send({ content: response[1] });
                }
            } else if (editInitial) {
                await msg.edit({ content: response });
            } else {
                await msg.reply({ content: response });
            }
        } catch (error) {
            console.error('Error handling GPT response:', error);
            await msg.reply({
                content: 'Sorry, something went wrong while processing your request.',
            });
        }
    }

    private async handleRepliedMessage(message: Message, client: Client): Promise<void> {
        try {
            const repliedMessage = await message.channel.messages.fetch(`${message.reference!.messageId}`);
            const isBotReply = repliedMessage.author.id === client.user?.id;
            const strippedContent = message.content.replace(/<@!?(\d+)>/g, '').trim();

            if (isBotReply && strippedContent.length === 0) return;

            if (isBotReply && message.author.id !== client.user?.id) {
                await this.handleGPTResponse(message.content, message.author, message, client);
            } else if (message.mentions.has(`${client.user?.id}`) && !message.author.bot) {
                await this.handleGPTResponse(repliedMessage.content, message.author, repliedMessage, client);
            }
        } catch (e) {
            console.error('Error fetching or processing the replied message:', e);
        }
    }
}
