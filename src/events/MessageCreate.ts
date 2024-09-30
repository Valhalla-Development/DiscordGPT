import type { ArgsOf, Client } from 'discordx';
import { Discord, On } from 'discordx';
import {
    codeBlock, EmbedBuilder, Message, User,
} from 'discord.js';
import { runGPT } from '../utils/Util.js';

@Discord()
export class MessageCreate {
    /**
     * Handler for messageCreate event.
     * @param args - An array containing the message and client objects.
     * @param client - The Discord client.
     */
    @On({ event: 'messageCreate' })
    async onMessage([message]: ArgsOf<'messageCreate'>, client: Client) {
        // Return if the author is a bot, preventing the bot from replying to itself or other bots.
        if (message.author.bot) return;

        // Function to process GPT for a given content and user ID.
        const processGPT = async (content: string, user: User, msg: Message) => {
            await message.channel?.sendTyping();

            const response = await runGPT(content, user);

            if (typeof response === 'boolean' && response) {
                return message.reply({ content: `You currently have an ongoing request. Please refrain from sending additional queries to avoid spamming ${client?.user}` });
            }

            if (response === content.replaceAll(/<@!?(\d+)>/g, '')) {
                return message.reply({
                    content: `An error occurred, please report this to a member of our moderation team.\n
            ${codeBlock('js', 'Error: Response was equal to query.')}`,
                });
            }

            if (Array.isArray(response)) {
                const initialMessage = await msg.reply({ content: response[0] });
                await initialMessage.reply({ content: response[1] });
            } else if (typeof response === 'string') {
                await msg.reply({ content: response });
            }
        };

        // Handle DMs
        if (!message.guild) {
            if (process.env.ENABLE_DIRECT_MESSAGES === 'true') {
                await processGPT(message.content, message.author, message);
            } else {
                const replyMsg = process.env.SUPPORT_SERVER_INVITE
                    ? `[${client.user?.username} Discord server](${process.env.SUPPORT_SERVER_INVITE})`
                    : `**${client.user?.username} Discord server**`;

                const embed = new EmbedBuilder().setColor('#EC645D').addFields([
                    {
                        name: `**${client.user?.username}**`,
                        value: `To better assist you, please use our bot within the ${replyMsg}.\nHead over there for a seamless experience. See you on the server!`,
                    },
                ]);

                await message.reply({ embeds: [embed] });
            }
            return;
        }

        // Return if guild is not whitelisted
        const { ALLOWED_SERVER_IDS } = process.env;
        if (ALLOWED_SERVER_IDS && !ALLOWED_SERVER_IDS.split(',').some((item) => item === message.guild?.id.toString())) return;

        // Function to check whether the bot should respond to the message.
        const shouldRespond = () => {
            const excludedChannels = process.env.EXCLUDED_CHANNEL_IDS?.split(',') ?? [];
            if (excludedChannels.includes(message.channel.id)) return false;

            if (message.mentions.users.size > 0 && !message.mentions.users.has(client.user!.id)) return false;

            const chance = Math.random();
            const regex = /^.{5,100}\?$/;
            return (
                chance <= 0.04
                && regex.test(message.content)
                && message.content.replaceAll(/<@!?(\d+)>/g, '').length
                && !message.reference
            );
        };

        // Handle guild messages
        if (shouldRespond()) {
            await processGPT(message.content, message.author, message);
            return;
        }

        if (message.reference) {
            try {
                const repliedMessage = await message.channel.messages.fetch(`${message.reference.messageId}`);
                if (!repliedMessage.content.replaceAll(/<@!?(\d+)>/g, '').length) return;

                const isBotReply = repliedMessage.author.id === client.user?.id;

                if (isBotReply && message.author.id !== client.user?.id) {
                    await processGPT(message.content, message.author, message);
                } else if (message.mentions.has(`${client.user?.id}`) && !message.author.bot) {
                    await processGPT(repliedMessage.content, message.author, repliedMessage);
                }
            } catch (e) {
                console.error('Error fetching or processing the replied message:', e);
            }
        } else if (message.mentions.has(`${client.user?.id}`)) {
            await processGPT(message.content, message.author, message);
        }
    }
}
