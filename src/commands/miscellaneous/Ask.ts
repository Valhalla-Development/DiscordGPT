import {
    Client, Discord, Slash, SlashOption,
} from 'discordx';
import {
    ApplicationCommandOptionType,
    ChannelType,
    codeBlock,
    CommandInteraction,
    GuildTextBasedChannel,
    PublicThreadChannel,
    ThreadAutoArchiveDuration,
} from 'discord.js';
import { Category } from '@discordx/utilities';
import { handleError, runGPT } from '../../utils/Util.js';

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

        // Check if threads are enabled AND we're in a guild (not DMs)
        if (process.env.ENABLE_MESSAGE_THREADS === 'true' && interaction.guild && interaction.channel?.type === ChannelType.GuildText) {
            const threadName = `Conversation with ${interaction.user.username}`;

            try {
                // Check for existing active thread
                const activeThreads = await interaction.guild?.channels.fetchActiveThreads();
                const existingThread = Array.from(activeThreads?.threads.values() ?? []).find(
                    (thread) => thread.name === threadName && !thread.archived,
                );

                if (existingThread) {
                    const threadUrl = `https://discord.com/channels/${interaction.guild!.id}/${existingThread.id}/${existingThread.id}`;
                    await interaction.editReply({
                        content: `You already have an active thread. Please submit your request here: ${threadUrl}.`,
                    });
                    return;
                }

                await interaction.deleteReply();

                // Create thread on the interaction reply
                const thread = await interaction.channel.threads.create({
                    name: threadName,
                    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
                    reason: `Thread created for conversation with ${interaction.user.tag}`,
                });

                // Add the user to the thread
                await thread.members.add(interaction.user.id);

                // Send the user's query as a message
                await thread.send({
                    content: `**${interaction.user.displayName}'s query:** ${query}\n\n`,
                });

                const initialMessage = await thread.send({ content: 'Generating response...' });
                const response = await runGPT(query, interaction.user);

                // Handle the response
                if (typeof response === 'boolean' && response) {
                    await interaction.editReply({
                        content: `You currently have an ongoing request. Please refrain from sending additional queries to avoid spamming ${client?.user}`,
                    });
                    return;
                }

                if (response === query.replace(/<@!?(\d+)>/g, '')) {
                    await interaction.editReply({
                        content: `An error occurred, please report this to a member of our moderation team.\n${codeBlock('js', 'Error: Response was equal to query.')}`,
                    });
                    return;
                }

                // Update the initial message in the thread
                if (Array.isArray(response)) {
                    await initialMessage.edit({ content: response[0] });
                    await (thread as GuildTextBasedChannel | PublicThreadChannel).send({ content: response[1] });
                } else if (typeof response === 'string') {
                    await initialMessage.edit({ content: response });
                } else {
                    await initialMessage.edit({ content: 'An error occurred while processing your request.' });
                }

                // Update the original interaction with thread link
                await interaction.editReply({ content: `I've created a thread for our conversation: ${thread.url}` });
            } catch (error) {
                console.error('Error creating thread:', error);
                await handleError(client, error);
                await interaction.channel.send({
                    content: 'Sorry, I couldn\'t create a thread. Please try again later or contact support.',
                });
            }
        } else {
            const response = await runGPT(query, interaction.user);

            if (typeof response === 'boolean' && response) {
                return interaction.editReply({
                    content: `You currently have an ongoing request. Please refrain from sending additional queries to avoid spamming ${client?.user}`,
                });
            }

            if (response === query.replace(/<@!?(\d+)>/g, '')) {
                return interaction.editReply({
                    content: `An error occurred, please report this to a member of our moderation team.\n${codeBlock('js', 'Error: Response was equal to query.')}`,
                });
            }

            if (Array.isArray(response)) {
                await interaction.editReply({ content: response[0] });
                await interaction.followUp({ content: response[1] });
            } else if (typeof response === 'string') {
                await interaction.editReply({ content: response });
            }
        }
    }
}
