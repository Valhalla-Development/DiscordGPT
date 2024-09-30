import { Discord, Slash, SlashOption } from 'discordx';
import type { CommandInteraction } from 'discord.js';
import { ApplicationCommandOptionType, GuildMember, PermissionsBitField } from 'discord.js';
import { Category } from '@discordx/utilities';
import { getGptQueryData, setGptQueryData } from '../../utils/Util.js';

@Discord()
@Category('Staff')
export class Reset {
    @Slash({
        description: 'Reset a users queries.',
        defaultMemberPermissions: [PermissionsBitField.Flags.ManageMessages],
    })
    /**
     * Reset a user's queries for the GPT module.
     * @param user - The user to reset
     * @param interaction - The command interaction.
     * @param client - The Discord client.
     */
    async reset(
        @SlashOption({
            description: 'User',
            name: 'user',
            required: true,
            type: ApplicationCommandOptionType.User,
        })
            user: GuildMember,

            interaction: CommandInteraction,
    ) {
        // Check if command was executed by an admin defined in the environment variable.
        const adminIds = process.env.ADMIN_USER_IDS?.split(',');
        const isAdmin = adminIds?.some((id) => id === interaction.user.id);

        if (interaction.user.id === user.id && !isAdmin) {
            await interaction.reply({ content: '⚠️ You can\'t perform this action on yourself', ephemeral: true });
            return;
        }

        const { MAX_QUERIES_LIMIT } = process.env;

        // Fetch the user's data
        const db = await getGptQueryData(user.id);

        // User has no data saved
        if (!db) return interaction.reply({ ephemeral: true, content: `⚠️ ${user} has no available data to reset.` });

        // User is either whitelisted or blacklisted
        if (db.blacklisted || db.whitelisted) {
            await interaction.reply({ ephemeral: true, content: `⚠️ ${user} is ${db.whitelisted ? 'whitelisted.' : 'blacklisted.'}` });
            return;
        }

        // User has data, but has not used any queries.
        if (db.queriesRemaining === Number(MAX_QUERIES_LIMIT)) return interaction.reply({ ephemeral: true, content: `⚠️ ${user} has not used any available queries.` });

        // Reset cooldown
        await setGptQueryData(
            user.id,
            db.totalQueries,
            Number(MAX_QUERIES_LIMIT),
            Number(1),
            db.whitelisted,
            db.blacklisted,
            db.threadId,
        );

        await interaction.reply({ ephemeral: true, content: `${user} has had their usages reset.` });
    }
}
