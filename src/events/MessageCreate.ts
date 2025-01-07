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
import { handleThreadCreation, runGPT } from '../utils/Util.js';

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

    /**
     * Main message handler for all incoming messages
     * @param message - The Discord message object
     * @param client - The Discord client instance
     */
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

    /**
     * Checks if the bot is allowed to operate in the given server
     * @param guildId - The Discord server ID
     * @returns true if the bot can operate in this server
     */
    private isServerAllowed(guildId: string): boolean {
        if (this.allowedServers.length === 0) return true;
        return this.allowedServers.includes(guildId);
    }

    /**
     * Handles direct messages sent to the bot
     * Either processes the message or redirects to support server
     */
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

    /**
     * Determines if the bot should respond to a message based on various criteria:
     * - Message is a question
     * - Message is not in excluded channels
     * - Message has meaningful content
     * - Random chance (4%)
     */
    private shouldRespond(message: Message, client: Client): boolean {
        if (this.excludedChannels.has(message.channel.id)) return false;

        if (message.mentions.users.size > 0 && !message.mentions.users.has(client.user!.id)) return false;

        const chance = Math.random();
        const isQuestion = /^.{5,100}\?$/.test(message.content);
        const hasContent = message.content.replace(/<@!?(\d+)>/g, '').length > 0;
        const notAReply = !message.reference;

        return chance <= 0.04 && isQuestion && hasContent && notAReply;
    }

    /**
     * Manages thread creation and responses for thread-based conversations
     * @returns true if the message was handled within thread context
     */
    private async manageThreadsIfNeeded(message: Message, client: Client): Promise<boolean> {
        if (!message.channel.isThread() && message.mentions.has(client.user!.id)) {
            const isReplyToAnotherUser = message.reference
                ? (await message.channel.messages.fetch(`${message.reference.messageId}`)).author.id !== client.user!.id
                : false;

            if (!isReplyToAnotherUser) {
                return handleThreadCreation({
                    source: message,
                    client,
                    user: message.author,
                    query: message.content,
                    commandUsageChannel: this.commandUsageChannel,
                });
            }
        }
        return false;
    }

    /**
     * Processes a message through GPT and sends the response
     * @param content - The message content to process
     * @param user - The user who sent the message
     * @param msg - The original message object
     * @param client - The Discord client instance
     * @param editInitial - Whether to edit the initial message instead of replying
     */
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

    /**
     * Handles messages that are replies to other messages
     * Processes both replies to bot messages and mentions in replies
     */
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
