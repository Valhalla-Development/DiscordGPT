import {
    ActionRowBuilder,
    ApplicationCommandType,
    ChannelType,
    codeBlock,
    type GuildTextBasedChannel,
    type MessageContextMenuCommandInteraction,
    ModalBuilder,
    type ModalSubmitInteraction,
    PermissionsBitField,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { type Client, ContextMenu, Discord, ModalComponent } from 'discordx';
import { config } from '../config/Config.js';

let messageUrl = '';

@Discord()
export class ReportInaccuracy {
    /**
     * Handles the context menu interaction for reporting an inaccuracy.
     * @param interaction - The context menu interaction.
     * @param client - The Discord client.
     */
    @ContextMenu({
        name: 'Report Inaccuracy',
        type: ApplicationCommandType.Message,
    })
    async reportInaccuracy(
        interaction: MessageContextMenuCommandInteraction,
        client: Client
    ): Promise<void> {
        // Ensure the selected message was sent by the bot itself
        if (interaction.targetMessage.author.id !== client.user?.id) {
            await interaction.reply({
                content: `⚠️ Invalid target - please only report inaccuracies on messages from ${client.user}`,
                ephemeral: true,
            });
            return;
        }

        // Check if the report channel is configured
        if (!config.REPORT_CHANNEL_ID) {
            await interaction.reply({
                content: '⚠️ Report functionality is not configured on this server.',
                ephemeral: true,
            });
            return;
        }

        // Get the configured report channel
        const channel = interaction.guild?.channels.cache.get(config.REPORT_CHANNEL_ID);

        // Validate the channel
        if (!channel || channel.type !== ChannelType.GuildText) {
            await interaction.reply({
                content: '⚠️ Invalid channel configuration. Please report this to a staff member.',
                ephemeral: true,
            });
            return;
        }

        // Check if the bot has permission to send messages in the channel
        if (
            !interaction.guild?.members.me
                ?.permissionsIn(channel)
                .has(PermissionsBitField.Flags.SendMessages)
        ) {
            await interaction.reply({
                content:
                    '⚠️ I lack permission to send messages in the configured channel. Please report this to a staff member.',
                ephemeral: true,
            });
            return;
        }

        // Store the URL of the message being reported
        messageUrl = interaction.targetMessage.url;

        // Create the modal for user input
        const modal = new ModalBuilder()
            .setTitle('Report Inaccuracy')
            .setCustomId('reportInaccuracy');

        const input = new TextInputBuilder()
            .setCustomId('modalField')
            .setLabel('Describe the inaccuracy in the message')
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(1)
            .setMaxLength(200);

        const inputRow = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
        modal.addComponents(inputRow);
        await interaction.showModal(modal);
    }

    /**
     * Handles the submission of the report modal.
     * @param interaction - The modal submission interaction.
     */
    @ModalComponent({ id: 'reportInaccuracy' })
    async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
        try {
            // Get the report channel
            const channel = interaction.guild?.channels.cache.get(
                config.REPORT_CHANNEL_ID!
            ) as GuildTextBasedChannel;

            // Send the report to the designated channel
            await channel.send(
                `Inaccuracy reported by ${interaction.user} *(${messageUrl})*\n\nDescription:\n${codeBlock('text', interaction.fields.getTextInputValue('modalField'))}`
            );

            // Acknowledge the user that their report has been submitted
            await interaction.reply({
                content: '✅ Thank you! Your report has been submitted.',
                ephemeral: true,
            });
        } catch (error) {
            await interaction.reply({
                content: `An error occurred, please report this to a member of our moderation team.\n${codeBlock('ts', `${error}`)}`,
            });
        }
    }
}
