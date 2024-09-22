import type { ArgsOf, Client } from 'discordx';
import { Discord, On } from 'discordx';
import { ChannelType, codeBlock, EmbedBuilder } from 'discord.js';
import moment from 'moment';
import '@colors/colors';
import { reversedRainbow } from '../utils/Util.js';

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
        if (!interaction || !interaction.guild || !interaction.channel || interaction.channel.type !== ChannelType.GuildText
            || (!interaction.isStringSelectMenu() && !interaction.isChatInputCommand()
                && !interaction.isContextMenuCommand() && !interaction.isButton() && !interaction.isModalSubmit())) return;

        // Return if guild is not whitelisted
        const { ServerWhitelist } = process.env;
        if (ServerWhitelist && !ServerWhitelist.split(',').some((item) => item === interaction.guild?.id.toString())) return;

        try {
            await client.executeInteraction(interaction);
        } catch (err) {
            console.error('Error executing interaction');
            console.error(err);
        }

        if (process.env.Logging && process.env.Logging.toLowerCase() === 'true') {
            const nowInMs = Date.now();
            const nowInSecond = Math.round(nowInMs / 1000);

            const logEmbed = new EmbedBuilder().setColor('#EC645D');

            if (interaction.isChatInputCommand()) {
                logEmbed.addFields({
                    name: `Guild: ${interaction.guild.name} | Date: <t:${nowInSecond}>`,
                    value: codeBlock('kotlin', `${interaction.user.username} executed the '${interaction.toString()}' command`),
                });

                console.log(
                    `${'◆◆◆◆◆◆'.rainbow.bold} ${moment().format('MMM D, h:mm A')} ${reversedRainbow('◆◆◆◆◆◆')}\n`
                    + `${'🔧 Command:'.brightBlue.bold} ${interaction.toString().brightYellow.bold}\n${
                        `${'🔍 Executor:'.brightBlue.bold} ${interaction.user.displayName.underline.brightMagenta.bold} ${'('.gray.bold}${'Guild: '.brightBlue.bold}${interaction.guild.name.underline.brightMagenta.bold}`.brightBlue.bold}${')'.gray.bold}\n`,
                );

                if (process.env.CommandLogging) {
                    const channel = client.channels.cache.get(process.env.CommandLogging);
                    if (channel && channel.type === ChannelType.GuildText) {
                        channel.send({ embeds: [logEmbed] });
                    }
                }
            }

            if (interaction.isContextMenuCommand()) {
                logEmbed.addFields({
                    name: `Guild: ${interaction.guild.name} | Date: <t:${nowInSecond}>`,
                    value: codeBlock('kotlin', `${interaction.user.username} executed the '${interaction.commandName}' context menu`),
                });

                console.log(
                    `${'◆◆◆◆◆◆'.rainbow.bold} ${moment().format('MMM D, h:mm A')} ${reversedRainbow('◆◆◆◆◆◆')}\n`
                    + `${'🔧 Context Menu:'.brightBlue.bold} ${interaction.commandName.brightYellow.bold}\n${
                        `${'🔍 Executor:'.brightBlue.bold} ${interaction.user.displayName.underline.brightMagenta.bold} ${'('.gray.bold}${'Guild: '.brightBlue.bold}${interaction.guild.name.underline.brightMagenta.bold}`.brightBlue.bold}${')'.gray.bold}\n`,
                );

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
