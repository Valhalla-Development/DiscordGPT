import type { ArgsOf, Client } from 'discordx';
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
        const regex = /^.{10,100}\?$/;

        // Respond to messages with a 15% chance if they end with a question mark and is less than 100 characters
        const chance = Math.random();
        if (chance <= 0.15) {
            if (regex.test(message.content)) {
                await message.channel.sendTyping();

                // Query AirRepsGPT
                await runGPT();
                return;
            }
        }

        // Return if no one was mentioned or the user mentioned was NOT the bot.
        if (!message.mentions.users.size || !message.mentions.has(`${client.user?.id}`)) return;

        await message.channel.sendTyping();

        const errorEmbed = new EmbedBuilder().setColor('#EC645D').addFields([
            {
                name: `**${client.user?.username}**`,
                value: 'An error occurred, please report this to a member of our moderation team.',
            },
        ]);

        await runGPT();

        async function runGPT() {
            try {
                // Load the Assistant for the message content
                const res = await loadAssistant(client, message, message.content);

                // Reply with the Assistant's response
                if (res) {
                    await message.reply(res);
                } else {
                    await message.reply({ embeds: [errorEmbed] });
                }
            } catch (e) {
                // Send an error message and log the error
                await message.reply({ embeds: [errorEmbed] });
                console.error(e);
            }
        }
    }
}
