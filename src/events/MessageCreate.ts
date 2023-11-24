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

        // Direct users to the Discord server if messageCreate is triggered outside a guild.
        if (!message.guild) {
            const embed = new EmbedBuilder().setColor('#EC645D').addFields([
                {
                    name: `**${client.user?.username}**`,
                    value: `To better assist you, please use our bot within the [${process.env.ProjectName} Discord server](${process.env.ProjectSupportInvite}).\nHead over there for a seamless experience. See you on the server!`,
                },
            ]);

            await message.reply({ embeds: [embed] });
            return;
        }

        // Function to check whether the bot should respond to the message.
        const shouldRespond = () => {
            // Check if the channel is excluded
            const excludedChannels = process.env.ExcludedChannels?.split(',') ?? [];
            if (excludedChannels.includes(message.channel.id)) {
                return false;
            }

            // Check other conditions
            const chance = Math.random();
            const regex = /^.{5,100}\?$/;
            return (
                chance <= 0.04
                && regex.test(message.content)
                && message.content.replaceAll(/<@!?(\d+)>/g, '').length
                && !message.reference
            );
        };

        // Function to process GPT for a given content and user ID.
        const processGPT = async (content: string, user: User, msg: Message) => {
            await message.channel?.sendTyping();
            const response = await runGPT(content, user);

            // If the response is boolean and true, then the user already has an ongoing query
            if (typeof response === 'boolean' && response) {
                return message.reply({ content: `You currently have an ongoing request. Please refrain from sending additional queries to avoid spamming ${client?.user}` });
            }

            if (response === content.replaceAll(/<@!?(\d+)>/g, '')) {
                return message.reply({
                    content: `An error occurred, please report this to a member of our moderation team.\n
                ${codeBlock('js', 'Error: Response was equal to query.')}`,
                });
            }

            // If response is an array of responses
            if (Array.isArray(response)) {
                // Edit the first message
                const initialMessage = await msg.reply({ content: response[0] });
                await initialMessage.reply({ content: response[1] });
            } else if (typeof response === 'string') {
                // If the response is a string, send a single message
                await msg.reply({ content: response });
            }
        };

        // Respond to the message if the conditions are met.
        if (shouldRespond()) {
            await processGPT(message.content, message.author, message);
            return;
        }

        // Process the message if it is a reply.
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
            // Process the message if the bot is mentioned.
            await processGPT(message.content, message.author, message);
        }
    }
}
