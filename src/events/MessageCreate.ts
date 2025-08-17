import { ChannelType, EmbedBuilder, type Message, type User } from 'discord.js';
import { type ArgsOf, type Client, Discord, On } from 'discordx';
import { config } from '../config/Config.js';
import { handleGPTResponse, handleThreadCreation, runGPT } from '../utils/Util.js';

@Discord()
export class MessageCreate {
    private readonly threadsEnabled: boolean;

    private readonly commandUsageChannel?: string;

    private readonly allowedServers: string[];

    private readonly excludedChannels: Set<string>;

    private readonly supportServerInvite?: string;

    constructor() {
        this.threadsEnabled = config.ENABLE_MESSAGE_THREADS;
        this.commandUsageChannel = config.COMMAND_USAGE_CHANNEL;
        this.allowedServers = config.ALLOWED_SERVER_IDS || [];
        this.excludedChannels = new Set(config.EXCLUDED_CHANNEL_IDS || []);
        this.supportServerInvite = config.SUPPORT_SERVER_INVITE;
    }

    /**
     * Main message handler for all incoming messages
     * @param message - The Discord message object
     * @param client - The Discord client instance
     */
    @On({ event: 'messageCreate' })
    async onMessage([message]: ArgsOf<'messageCreate'>, client: Client) {
        if (message.author.bot) {
            return;
        }

        if (!message.guild) {
            await this.handleDirectMessage(message, client);
            return;
        }

        if (!this.isServerAllowed(message.guild.id)) {
            return;
        }

        // Check if bot is restricted to a specific channel
        if (this.commandUsageChannel && message.channel.id !== this.commandUsageChannel) {
            // Only show redirect if user is trying to interact with the bot
            const isMentioningBot = message.mentions.has(client.user!.id);
            let isReplyingToBot = false;

            if (message.reference) {
                try {
                    const repliedMessage = await message.channel.messages.fetch(
                        `${message.reference.messageId}`
                    );
                    isReplyingToBot = repliedMessage.author.id === client.user?.id;
                } catch {
                    // Silently fail if can't fetch message
                }
            }

            if (isMentioningBot || isReplyingToBot) {
                try {
                    const channel = await client.channels.fetch(this.commandUsageChannel);
                    if (channel?.isTextBased()) {
                        await message.reply({
                            content: `Please use me in ${channel} instead!`,
                        });
                    }
                } catch {
                    // Silently fail if can't fetch channel
                }
            }
            return;
        }

        if (this.threadsEnabled) {
            const handled = await this.manageThreadsIfNeeded(message, client);
            if (handled) {
                return;
            }
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
        if (this.allowedServers.length === 0) {
            return true;
        }
        return this.allowedServers.includes(guildId);
    }

    /**
     * Handles direct messages sent to the bot
     * Either processes the message or redirects to support server
     */
    private async handleDirectMessage(message: Message, client: Client) {
        if (config.ENABLE_DIRECT_MESSAGES) {
            await this.handleGPTResponse(message.content, message.author, message, client);
        } else {
            const replyMsg = this.supportServerInvite
                ? `[${client.user?.username} Discord server](${this.supportServerInvite})`
                : `**${client.user?.username} Discord server**`;

            const embed = new EmbedBuilder().setColor('#EC645D').addFields([
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
        if (this.excludedChannels.has(message.channel.id)) {
            return false;
        }

        if (message.mentions.users.size > 0 && !message.mentions.users.has(client.user!.id)) {
            return false;
        }

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
                ? (await message.channel.messages.fetch(`${message.reference.messageId}`)).author
                      .id !== client.user!.id
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
     */
    private async handleGPTResponse(
        content: string,
        user: User,
        msg: Message,
        client: Client
    ): Promise<void> {
        if (
            msg.channel.type === ChannelType.GuildText ||
            msg.channel.type === ChannelType.PublicThread ||
            msg.channel.type === ChannelType.DM
        ) {
            await msg.channel.sendTyping();
        }

        const response = await runGPT(content, user);
        await handleGPTResponse(response, msg, client);
    }

    /**
     * Handles messages that are replies to other messages
     * Processes both replies to bot messages and mentions in replies
     */
    private async handleRepliedMessage(message: Message, client: Client): Promise<void> {
        try {
            const repliedMessage = await message.channel.messages.fetch(
                `${message.reference!.messageId}`
            );
            const isBotReply = repliedMessage.author.id === client.user?.id;
            const strippedContent = message.content.replace(/<@!?(\d+)>/g, '').trim();

            if (isBotReply && strippedContent.length === 0) {
                return;
            }

            if (isBotReply && message.author.id !== client.user?.id) {
                await this.handleGPTResponse(message.content, message.author, message, client);
            } else if (message.mentions.has(`${client.user?.id}`) && !message.author.bot) {
                await this.handleGPTResponse(
                    repliedMessage.content,
                    message.author,
                    repliedMessage,
                    client
                );
            }
        } catch (e) {
            console.error('Error fetching or processing the replied message:', e);
        }
    }
}
