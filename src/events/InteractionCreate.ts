import type { ArgsOf, Client } from 'discordx';
import { Discord, On } from 'discordx';
import { ChannelType, codeBlock, EmbedBuilder } from 'discord.js';
import moment from 'moment';

@Discord()
export class InteractionCreate {
    /**
     * Handler for interactionCreate event.
     * @param args - An array containing the interaction and client objects.
     * @param client - The Discord client.
     */
    @On({ event: 'interactionCreate' })
    async onInteraction([interaction]: ArgsOf<'interactionCreate'>, client: Client) {
        // Check if the interaction is in a guild and in a guild text channel, and is either a string select menu or a chat input command.
        if (!interaction.guild || !interaction.channel || interaction.channel.type !== ChannelType.GuildText
            || (!interaction.isStringSelectMenu() && !interaction.isChatInputCommand() && !interaction.isContextMenuCommand())) return;

        try {
            await client.executeInteraction(interaction);
        } catch (err) {
            console.error(`Error executing interaction: ${err}`);
        }

        if (process.env.Logging && process.env.Logging.toLowerCase() === 'true') {
            if (interaction.isChatInputCommand()) {
                const nowInMs = Date.now();
                const nowInSecond = Math.round(nowInMs / 1000);

                const logEmbed = new EmbedBuilder().setColor('#e91e63');
                const executedCommand = interaction.toString();

                logEmbed.addFields({
                    name: `Guild: ${interaction.guild.name} | Date: <t:${nowInSecond}>`,
                    value: codeBlock('kotlin', `${interaction.user.username} executed the '${executedCommand}' command`),
                });

                const LoggingNoArgs = `[\x1b[31m${moment().format('LLLL')}\x1b[0m] '\x1b[92m${executedCommand}\x1b[0m' Command was executed by \x1b[31m${interaction.user.username}\x1b[0m (Guild: \x1b[31m${interaction.guild.name}\x1b[0m)`;
                console.log(LoggingNoArgs);

                if (process.env.CommandLogging) {
                    const channel = client.channels.cache.get(process.env.CommandLogging);
                    if (channel && channel.type === ChannelType.GuildText) {
                        channel.send({ embeds: [logEmbed] });
                    }
                }
            }
        }
    }
}
