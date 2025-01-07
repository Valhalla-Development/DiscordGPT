import {
    Client, Discord, Slash, SlashOption,
} from 'discordx';
import {
    ApplicationCommandOptionType,
    ChannelType,
    codeBlock,
    CommandInteraction,
    ThreadAutoArchiveDuration,
} from 'discord.js';
import { Category } from '@discordx/utilities';
import { handleThreadCreation, runGPT } from '../../utils/Util.js';

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

        if (process.env.ENABLE_MESSAGE_THREADS === 'true' && interaction.guild && interaction.channel?.type === ChannelType.GuildText) {
            await handleThreadCreation({
                source: interaction,
                client,
                user: interaction.user,
                query,
                commandUsageChannel: process.env.COMMAND_USAGE_CHANNEL,
            });
        } else {
            // Handle direct responses when threads are disabled or in DMs
            const response = await runGPT(query, interaction.user);

            if (typeof response === 'boolean' && response) {
                return interaction.editReply({
                    content: `You currently have an ongoing request. Please refrain from sending additional queries to avoid spamming ${client?.user}`,
                });
            }

            // Eat sand
            if (response === query.replace(/<@!?(\d+)>/g, '')) {
                return interaction.editReply({
                    content: `An error occurred, please report this to a member of our moderation team.\n${codeBlock('js', 'Error: Response was equal to query.')}`,
                });
            }

            // Send response directly in channel
            if (Array.isArray(response)) {
                await interaction.editReply({ content: response[0] });
                await interaction.followUp({ content: response[1] });
            } else if (typeof response === 'string') {
                await interaction.editReply({ content: response });
            }
        }
    }
}
