import { Discord, Slash, SlashOption } from 'discordx';
import type { CommandInteraction } from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';
import { Category } from '@discordx/utilities';
import { runGPT } from '../../utils/Util.js';

@Discord()
@Category('Miscellaneous')
export class Ask {
    /**
     * Query the AirRepsGPT model
     * @param query - The query for AirRepsGPT
     * @param interaction - The command interaction.
     */
    @Slash({ description: 'Query the AirRepsGPT model' })
    async ask(
        @SlashOption({
            description: 'Query the AirRepsGPT',
            name: 'query',
            required: true,
            type: ApplicationCommandOptionType.String,
            minLength: 4,
            maxLength: 100,
        })
            query: string,
            interaction: CommandInteraction,
    ) {
        if (!interaction.channel) return;

        await interaction.deferReply();

        const response = await runGPT(query, interaction.user);

        // If response is an array of responses
        if (Array.isArray(response)) {
            // Edit the first message
            const msg = await interaction.editReply({ content: response[0] });
            await msg.reply({ content: response[1] });
        } else {
            // If the response is a string, send a single message
            await interaction.editReply({ content: response });
        }
    }
}
