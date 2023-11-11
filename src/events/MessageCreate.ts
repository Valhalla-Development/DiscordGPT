import type { ArgsOf, Client } from 'discordx';
import type { Message } from 'discord.js';
import { Discord, On } from 'discordx';
import { EmbedBuilder } from 'discord.js';
import { loadAssistant } from '../utils/Util.js';

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
                    value: 'To better assist you, please use our bot within the [AirReps Discord server](https://airreps.link/discord).\nHead over there for a seamless experience. See you on the server!',
                },
            ]);

            await message.reply({ embeds: [embed] });
        }

        // Regex to match content less than or equal to 100, and ends with a question mark
        const regex = /^.{5,100}\?$/;

        // Respond to messages with a 15% chance if they end with a question mark and is less than 100 characters
        const chance = Math.random();
        if (chance <= 0.04) {
            if (regex.test(message.content)) {
                await message.channel.sendTyping();

                // Query AirRepsGPT
                await runGPT(message.content, message);
                return;
            }
        }

        // Return if no one was mentioned or the user mentioned was NOT the bot.
        if (!message.mentions.users.size || !message.mentions.has(`${client.user?.id}`)) return;

        // Pinging AirRepsGPT while replying to another user will trigger the GPT provider.
        if (message.reference && message.mentions.has(`${client.user?.id}`)) {
            try {
                const repliedMessage = await message.channel.messages.fetch(`${message.reference.messageId}`);

                if (repliedMessage && !repliedMessage.author.bot) {
                    await message.channel.sendTyping();
                    await runGPT(repliedMessage.content, repliedMessage);
                }
                return;
            } catch (e) {
                console.error('Error fetching or processing the replied message:', e);
            }
        }

        await message.channel.sendTyping();

        const errorEmbed = new EmbedBuilder().setColor('#EC645D').addFields([
            {
                name: `**${client.user?.username}**`,
                value: 'An error occurred, please report this to a member of our moderation team.',
            },
        ]);

        await runGPT(message.content, message);

        async function runGPT(cnt: string, msg: Message) {
            try {
                // Load the Assistant for the message content
                const res = await loadAssistant(client, message, cnt);

                // Reply with the Assistant's response
                if (res) {
                    await msg.reply(res);
                } else {
                    await msg.reply({ embeds: [errorEmbed] });
                }
            } catch (e) {
                // Send an error message and log the error
                await msg.reply({ embeds: [errorEmbed] });
                console.error(e);
            }
        }
    }
}
