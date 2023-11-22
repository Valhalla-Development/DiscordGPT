import {
    Client, Discord, Slash, SlashOption,
} from 'discordx';
import type { CommandInteraction } from 'discord.js';
import { ApplicationCommandOptionType, codeBlock } from 'discord.js';
import { Category } from '@discordx/utilities';
import { runGPT } from '../../utils/Util.js';

@Discord()
@Category('Miscellaneous')
export class Ask {
    /**
     * Query the DiscordGPT model
     * @param query - The query for DiscordGPT
     * @param interaction - The command interaction.
     * @param client - The Discord client.
     */
    @Slash({ description: 'Query the DiscordGPT model' })
    async ask(
        @SlashOption({
            description: 'Query the DiscordGPT',
            name: 'query',
            required: true,
            type: ApplicationCommandOptionType.String,
            minLength: 4,
            maxLength: 100,
        })
            query: string,
            interaction: CommandInteraction,
            client: Client,
    ) {
        if (!interaction.channel) return;

        const response = await runGPT(query, interaction.user);

        // If the response is boolean and true, then the user already has an ongoing query
        if (typeof response === 'boolean' && response) {
            return interaction.reply({ content: `You currently have an ongoing request. Please refrain from sending additional queries to avoid spamming ${client?.user}`, ephemeral: true });
        }

        if (response === query.replaceAll(/<@!?(\d+)>/g, '')) {
            return interaction.reply({
                content: `An error occurred, please report this to a member of our moderation team.\n
                ${codeBlock('js', 'Error: Reponse was equal to query.')}`,
            });
        }

        await interaction.deferReply();

        // If response is an array of responses
        if (Array.isArray(response)) {
            // Edit the first message
            const msg = await interaction.editReply({ content: response[0] });
            await msg.reply({ content: response[1] });
        } else if (typeof response === 'string') {
            // If the response is a string, send a single message
            await interaction.editReply({ content: response });
        }
    }
}
