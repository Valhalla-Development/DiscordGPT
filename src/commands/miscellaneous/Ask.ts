import {
    Client, Discord, Slash, SlashOption,
} from 'discordx';
import {
    ApplicationCommandOptionType, codeBlock, CommandInteraction, Message,
} from 'discord.js';
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
        await interaction.deferReply();

        // Pass the options to run the 'runGPT' function
        const response = await runGPT(query, interaction.user);

        // If the response is boolean and true, then the user already has an ongoing query
        if (typeof response === 'boolean' && response) {
            return interaction.reply({ content: `You currently have an ongoing request. Please refrain from sending additional queries to avoid spamming ${client?.user}` });
        }

        if (response === query.replaceAll(/<@!?(\d+)>/g, '')) {
            return interaction.reply({
                content: `An error occurred, please report this to a member of our moderation team.\n
                ${codeBlock('js', 'Error: Response was equal to query.')}`,
            });
        }

        // If response is an array of responses
        if (Array.isArray(response)) {
            await response.reduce<Promise<Message>>(async (prevMsgPromise, content, index) => {
                const msg = await prevMsgPromise;
                return index === 0
                    ? interaction.editReply({ content })
                    : msg.reply({ content });
            }, Promise.resolve(interaction.fetchReply()));
        } else if (typeof response === 'string') {
            // If the response is a string, send a single message
            await interaction.editReply({ content: response });
        }
    }
}
