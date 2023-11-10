import type { ArgsOf, Client } from 'discordx';
import { Discord, On } from 'discordx';
import { EmbedBuilder } from 'discord.js';

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
            const embed = new EmbedBuilder().setColor('#e91e63').addFields([
                {
                    name: `**${client.user?.username}**`,
                    value: 'To better assist you, please use our bot within the [AirReps Discord server](https://airreps.link/discord).\nHead over there for a seamless experience. See you on the server!',
                },
            ]);

            await message.reply({ embeds: [embed] });
        }
    }
}
