import { Category } from '@discordx/utilities';
import {
    ApplicationCommandOptionType,
    type CommandInteraction,
    type GuildMember,
    MessageFlags,
    PermissionsBitField,
} from 'discord.js';
import { Discord, Slash, SlashChoice, SlashOption } from 'discordx';
import { config } from '../../config/Config.js';
import { getGptQueryData, setGptQueryData } from '../../utils/Util.js';

@Discord()
@Category('Staff')
export class Blacklist {
    @Slash({
        description: 'Manages the blacklist for the GPT module.',
        defaultMemberPermissions: [PermissionsBitField.Flags.ManageMessages],
    })
    /**
     * Manages the blacklist for the GPT module.
     * @param user - The user to blacklist
     * @param interaction - The command interaction.
     * @param client - The Discord client.
     */
    async blacklist(
        @SlashChoice({ name: 'Add', value: 'add' })
        @SlashChoice({ name: 'Remove', value: 'remove' })
        @SlashChoice({ name: 'Check', value: 'check' })
        @SlashOption({
            description: 'Blacklist',
            name: 'option',
            required: true,
            type: ApplicationCommandOptionType.String,
        })
        option: string,

        @SlashOption({
            description: 'User',
            name: 'user',
            required: true,
            type: ApplicationCommandOptionType.User,
        })
        user: GuildMember,

        interaction: CommandInteraction
    ) {
        // Check if command was executed by an admin defined in the environment variable.
        const adminIds = config.ADMIN_USER_IDS;
        const isAdmin = adminIds?.some((id: string) => id === interaction.user.id);

        if (interaction.user.id === user.id && !isAdmin) {
            await interaction.reply({
                content: "⚠️ You can't perform this action on yourself",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const { MAX_QUERIES_LIMIT } = config;

        // Fetch the user's data
        const getDb = await getGptQueryData(user.id);

        if ((option === 'add' || option === 'remove') && !isAdmin) {
            await interaction.reply({
                content: '⚠️ Access Denied - This command is restricted to administrators only.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Add user to blacklist
        if (option === 'add') {
            // User is already blacklisted.
            if (getDb && getDb.blacklisted) {
                await interaction.reply({
                    content: '⚠️ User Already blacklisted.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            // Update the blacklist and send a success message.
            await setGptQueryData(
                user.id,
                getDb ? Number(getDb.totalQueries) : 0,
                Number(MAX_QUERIES_LIMIT),
                Number(1),
                false,
                true,
                getDb ? getDb.threadId : ''
            );
            await interaction.reply({
                content:
                    '✅ User Blacklisted - The user has been successfully added to the blacklist.',
                flags: MessageFlags.Ephemeral,
            });
        }

        // Remove user from blacklist
        if (option === 'remove') {
            // User is not blacklisted.
            if (!(getDb && getDb.blacklisted)) {
                await interaction.reply({
                    content: '⚠️ User is not Blacklisted.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            // Update the blacklist and send a success message.
            await setGptQueryData(
                user.id,
                Number(getDb.totalQueries),
                Number(MAX_QUERIES_LIMIT),
                Number(1),
                false,
                false,
                getDb.threadId
            );
            await interaction.reply({
                content:
                    '✅ User Removed - The user has been successfully removed from the blacklist.',
                flags: MessageFlags.Ephemeral,
            });
        }

        // Remove user from blacklist
        if (option === 'check') {
            // User is not blacklisted.
            if (getDb && getDb.blacklisted) {
                await interaction.reply({
                    content: '✅️ User is Blacklisted.',
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                await interaction.reply({
                    content: '⚠️ User is not Blacklisted.',
                    flags: MessageFlags.Ephemeral,
                });
            }
        }
    }
}
