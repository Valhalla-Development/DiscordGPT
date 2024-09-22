import { Client, ContextMenu, Discord } from 'discordx';
import { ApplicationCommandType, codeBlock, MessageContextMenuCommandInteraction } from 'discord.js';
import { runTTS } from '../utils/Util.js';

@Discord()
export class TextToSpeech {
    /**
     * Handles the "Text to Speech" context menu interaction.
     * Converts the content of a message into speech if TTS is enabled and valid.
     * @param interaction - The context menu interaction initiated by the user.
     * @param client - The Discord client.
     * */
    @ContextMenu({
        name: 'Text to Speech',
        type: ApplicationCommandType.Message,
    })
    async messageHandler(interaction: MessageContextMenuCommandInteraction, client: Client): Promise<void> {
        // Check if TTS is disabled via the environment variable.
        if (process.env.TTS !== 'true') {
            await interaction.reply({
                content: '⚠️ TTS not enabled - Text to speech is not enabled in this server.',
                ephemeral: true,
            });
            return;
        }

        // Ensure the selected message was sent by the bot itself, restricting TTS usage to bot messages.
        if (interaction.targetMessage.author.id !== client.user?.id) {
            await interaction.reply({
                content: `⚠️ Invalid target - please only use text to speech on messages from ${client.user}`,
                ephemeral: true,
            });
            return;
        }

        await interaction.deferReply();

        // Run the TTS conversion for the selected message's content.
        const res = await runTTS(interaction.targetMessage.content, interaction.user);

        // If the result is a string, it's likely an error message, so send it as the reply.
        if (typeof res === 'string') {
            await interaction.editReply(res);
            return;
        }

        // If the result is an Error object, notify the user and include details for debugging.
        if (res instanceof Error) {
            await interaction.editReply({ content: `An error occurred, please report this to a member of our moderation team.\n${codeBlock('ts', `${res}`)}` });
            return;
        }

        // If successful, send the TTS audio as an attachment, with a link to the original message.
        await interaction.editReply({ content: `Speech generated from: ${interaction.targetMessage.url}`, files: [res] });
    }
}
