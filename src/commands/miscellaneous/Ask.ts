import { Category } from '@discordx/utilities';
import { ApplicationCommandOptionType, ChannelType, type CommandInteraction } from 'discord.js';
import { type Client, Discord, Slash, SlashOption } from 'discordx';
import { config } from '../../config/Config.js';
import { handleGPTResponse, handleThreadCreation, runGPT } from '../../utils/Util.js';

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
        client: Client
    ) {
        await interaction.deferReply();

        if (
            config.ENABLE_MESSAGE_THREADS &&
            interaction.guild &&
            interaction.channel?.type === ChannelType.GuildText
        ) {
            await handleThreadCreation({
                source: interaction,
                client,
                user: interaction.user,
                query,
                commandUsageChannel: config.COMMAND_USAGE_CHANNEL,
            });
        } else {
            const response = await runGPT(query, interaction.user);
            await handleGPTResponse(response, interaction, client);
        }
    }
}
