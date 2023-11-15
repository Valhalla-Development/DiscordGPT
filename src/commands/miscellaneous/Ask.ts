import type { Client } from 'discordx';
import { Discord, Slash, SlashOption } from 'discordx';
import type { CommandInteraction } from 'discord.js';
import { ApplicationCommandOptionType, codeBlock } from 'discord.js';
import { Category } from '@discordx/utilities';
import { checkGptAvailability, loadAssistant } from '../../utils/Util.js';

@Discord()
@Category('Miscellaneous')
export class Ask {
    /**
     * Query the AirRepsGPT model
     * @param query - The query for AirRepsGPT
     * @param interaction - The command interaction.
     * @param client - The Discord client.
     */
    @Slash({ description: 'Query the AirRepsGPT model' })
    async ask(
        @SlashOption({
            description: 'Query the AirRepsGPT',
            name: 'query',
            required: true,
            type: ApplicationCommandOptionType.String,
            minLength: 5,
            maxLength: 100,
        })
            query: string,
            interaction: CommandInteraction,
            client: Client,
    ) {
        if (!interaction.channel) return;

        // Check if the user has available queries.
        const check = await checkGptAvailability(interaction.user?.id);
        if (typeof check === 'string') {
            await interaction.reply({ content: check, ephemeral: true }).then((msg) => setTimeout(() => msg.delete(), 6000));
            return;
        }

        await interaction.deferReply();

        try {
            // Load the Assistant for the message content
            const res = await loadAssistant(client, interaction, query);

            // Reply with the Assistant's response
            if (typeof res === 'string') {
                await interaction.editReply(res);
            } else {
                await interaction.editReply({ content: `An error occurred, please report this to a member of our moderation team.\n${codeBlock('ts', `${res}`)}` });
            }
        } catch (e) {
            // Send an error message and log the error
            await interaction.editReply({ content: `An error occurred, please report this to a member of our moderation team.\n${codeBlock('ts', `${e}`)}` });
            console.error(e);
        }
    }
}
