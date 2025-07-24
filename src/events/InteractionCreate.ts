import { ChannelType, codeBlock, EmbedBuilder } from 'discord.js';
import { type ArgsOf, type Client, Discord, On } from 'discordx';
import moment from 'moment';
import '@colors/colors';
import { config } from '../config/Config.js';
import { reversedRainbow } from '../utils/Util.js';

@Discord()
export class InteractionCreate {
    /**
     * Handler for interactionCreate event.
     * @param args - An array containing the interaction and client objects.
     * @param client - The Discord client.
     */
    @On({ event: 'interactionCreate' })
    async onInteraction([interaction]: ArgsOf<'interactionCreate'>, client: Client): Promise<void> {
        if (
            !(
                interaction &&
                interaction.channel &&
                (interaction.isStringSelectMenu() ||
                    interaction.isChatInputCommand() ||
                    interaction.isContextMenuCommand() ||
                    interaction.isButton() ||
                    interaction.isModalSubmit())
            )
        ) {
            return;
        }

        // Skip processing if the interaction is not in a guild (i.e., it's a DM) and DMs are not enabled
        if (!(interaction.guild || config.ENABLE_DIRECT_MESSAGES)) {
            const replyMsg = config.SUPPORT_SERVER_INVITE
                ? `[${client.user?.username} Discord server](${config.SUPPORT_SERVER_INVITE})`
                : `**${client.user?.username} Discord server**`;

            const embed = new EmbedBuilder().setColor('#EC645D').addFields([
                {
                    name: `**${client.user?.username}**`,
                    value: `To better assist you, please use our bot within the ${replyMsg}.\nHead over there for a seamless experience. See you on the server!`,
                },
            ]);

            await interaction.reply({ embeds: [embed] });
            return;
        }

        // Return if guild is not whitelisted
        const { ALLOWED_SERVER_IDS } = config;

        if (
            interaction.guild &&
            ALLOWED_SERVER_IDS &&
            ALLOWED_SERVER_IDS.length > 0 &&
            !ALLOWED_SERVER_IDS.some((serverId: string) => serverId === interaction.guild?.id)
        ) {
            console.log(
                `❌ Guild ${interaction.guild?.id} is not whitelisted in ALLOWED_SERVER_IDS configuration.`
            );
            return;
        }

        // Check if bot is restricted to a specific channel
        if (
            config.COMMAND_USAGE_CHANNEL &&
            interaction.channelId !== config.COMMAND_USAGE_CHANNEL
        ) {
            try {
                const channel = await client.channels.fetch(config.COMMAND_USAGE_CHANNEL);
                if (channel?.isTextBased()) {
                    await interaction.reply({
                        content: `Please use me in ${channel} instead!`,
                        ephemeral: true,
                    });
                }
            } catch {
                // Silently fail if can't fetch channel
            }
            return;
        }

        try {
            await client.executeInteraction(interaction);
        } catch (err) {
            console.error('Error executing interaction');
            console.error(err);
        }

        if (!interaction.guild || interaction.channel.type !== ChannelType.GuildText) {
            return;
        }

        if (config.ENABLE_LOGGING) {
            try {
                const reply = await interaction.fetchReply().catch(() => null);

                const link =
                    reply?.guildId && reply?.channelId && reply?.id
                        ? `https://discord.com/channels/${reply.guildId}/${reply.channelId}/${reply.id}`
                        : `<#${interaction.channelId}>`;

                const now = Date.now();
                const nowInSeconds = Math.floor(now / 1000);

                const executedCommand = interaction.isChatInputCommand()
                    ? interaction.toString()
                    : interaction.isContextMenuCommand()
                      ? interaction.commandName
                      : '';

                if (interaction.isChatInputCommand()) {
                    // Console logging
                    console.log(
                        `${'◆◆◆◆◆◆'.rainbow.bold} ${moment(now).format('MMM D, h:mm A')} ${reversedRainbow('◆◆◆◆◆◆')}\n` +
                            `${'🔧 Command:'.brightBlue.bold} ${executedCommand.brightYellow.bold}\n` +
                            `${'🔍 Executor:'.brightBlue.bold} ${interaction.user.displayName.underline.brightMagenta.bold} ${'('.gray.bold}${'Guild: '.brightBlue.bold}${interaction.guild?.name.underline.brightMagenta.bold}${')'}`
                    );
                }

                if (interaction.isContextMenuCommand()) {
                    // Console logging
                    console.log(
                        `${'◆◆◆◆◆◆'.rainbow.bold} ${moment(now).format('MMM D, h:mm A')} ${reversedRainbow('◆◆◆◆◆◆')}\n` +
                            `${'🔧 Context Menu:'.brightBlue.bold} ${executedCommand.brightYellow.bold}\n` +
                            `${'🔍 Executor:'.brightBlue.bold} ${interaction.user.displayName.underline.brightMagenta.bold} ${'('.gray.bold}${'Guild: '.brightBlue.bold}${interaction.guild?.name.underline.brightMagenta.bold}${')'}`
                    );
                }

                // Embed logging
                const logEmbed = new EmbedBuilder()
                    .setColor('#e91e63')
                    .setTitle(
                        `${interaction.isChatInputCommand() ? 'Command' : 'Context Menu'} Executed`
                    )
                    .addFields(
                        { name: '👤 User', value: `${interaction.user}`, inline: true },
                        { name: '📅 Date', value: `<t:${nowInSeconds}:F>`, inline: true },
                        { name: '📰 Interaction', value: link, inline: true },
                        {
                            name: `🖥️ ${interaction.isChatInputCommand() ? 'Command' : 'Context Menu'}`,
                            value: codeBlock('kotlin', executedCommand),
                        }
                    );

                // Channel logging
                if (
                    (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) &&
                    config.COMMAND_LOGGING_CHANNEL
                ) {
                    const channel = client.channels.cache.get(config.COMMAND_LOGGING_CHANNEL);
                    if (channel?.type === ChannelType.GuildText) {
                        channel.send({ embeds: [logEmbed] }).catch(console.error);
                    }
                }
            } catch (error) {
                console.error('Error logging command usage:', error);
            }
        }
    }
}
