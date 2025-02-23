import {
    ActionRowBuilder,
    ApplicationCommandType,
    ChannelType,
    type GuildTextBasedChannel,
    type MessageContextMenuCommandInteraction,
    ModalBuilder,
    type ModalSubmitInteraction,
    PermissionsBitField,
    TextInputBuilder,
    TextInputStyle,
    codeBlock,
} from 'discord.js';
import { type Client, ContextMenu, Discord, ModalComponent } from 'discordx';

let messageUrl = '';

@Discord()
export class ReportInaccuracy {
    /**
     * Handles the context menu interaction for reporting an inaccuracy.
     * @param interaction - The context menu interaction.
     * @param client - The Discord client.
     * */
    @ContextMenu({
        name: 'Report Inaccuracy',
        type: ApplicationCommandType.Message,
    })
    async userHandler(
        interaction: MessageContextMenuCommandInteraction,
        client: Client
    ): Promise<void> {
        // Check if reporting is enabled for this server
        if (!process.env.REPORT_CHANNEL_ID) {
            await interaction.reply({
                content: '⚠️ Reporting is not enabled on this server.',
                ephemeral: true,
            });
            return;
        }

        // Ensure the selected message was sent by the bot itself, restricting ReportInaccuracy usage to bot messages.
        if (interaction.targetMessage.author.id !== client.user?.id) {
            await interaction.reply({
                content: `⚠️ Invalid target - reports can only be made for inaccuracies from ${client.user}`,
                ephemeral: true,
            });
            return;
        }

        // Get the configured report channel
        const channel = interaction.guild?.channels.cache.get(process.env.REPORT_CHANNEL_ID);

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
                process.env.REPORT_CHANNEL_ID!
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
