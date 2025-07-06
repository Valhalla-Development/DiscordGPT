import { Category } from '@discordx/utilities';
import {
    ApplicationCommandOptionType,
    type CommandInteraction,
    type GuildMember,
    PermissionsBitField,
} from 'discord.js';
import { Discord, Slash, SlashChoice, SlashOption } from 'discordx';
import { config } from '../../config/Config.js';
import { getGptQueryData, setGptQueryData } from '../../utils/Util.js';

@Discord()
@Category('Staff')
export class Whitelist {
    @Slash({
        description: 'Manages the whitelist for the GPT module.',
        defaultMemberPermissions: [PermissionsBitField.Flags.ManageMessages],
    })
    /**
     * Manages the whitelist for the GPT module.
     * @param user - The user to whitelist
     * @param interaction - The command interaction.
     * @param client - The Discord client.
     */
    async whitelist(
        @SlashChoice({ name: 'Add', value: 'add' })
        @SlashChoice({ name: 'Remove', value: 'remove' })
        @SlashChoice({ name: 'Check', value: 'check' })
        @SlashOption({
            description: 'Whitelist',
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
                ephemeral: true,
            });
            return;
        }

        const { MAX_QUERIES_LIMIT } = config;

        // Fetch the user's data
        const getDb = await getGptQueryData(user.id);

        if ((option === 'add' || option === 'remove') && !isAdmin) {
            await interaction.reply({
                content: '⚠️ Access Denied - This command is restricted to administrators only.',
                ephemeral: true,
            });
            return;
        }

        // Add user to whitelist
        if (option === 'add') {
            // User is already whitelisted.
            if (getDb && getDb.whitelisted) {
                await interaction.reply({
                    content: '⚠️ User Already Whitelisted.',
                    ephemeral: true,
                });
                return;
            }

            // Update the whitelist and send a success message.
            await setGptQueryData(
                user.id,
                getDb ? Number(getDb.totalQueries) : 0,
                Number(MAX_QUERIES_LIMIT),
                Number(1),
                true,
                false,
                getDb ? getDb.threadId : ''
            );
            await interaction.reply({
                content:
                    '✅ User Whitelisted - The user has been successfully added to the whitelist.',
                ephemeral: true,
            });
        }

        // Remove user from whitelist
        if (option === 'remove') {
            // User is not whitelisted.
            if (!(getDb && getDb.whitelisted)) {
                await interaction.reply({ content: '⚠️ User is not Whitelisted.', ephemeral: true });
                return;
            }

            // Update the whitelist and send a success message.
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
                    '✅ User Removed - The user has been successfully removed from the whitelist.',
                ephemeral: true,
            });
        }

        // Remove user from whitelist
        if (option === 'check') {
            // User is not whitelisted.
            if (getDb && getDb.whitelisted) {
                await interaction.reply({ content: '✅️ User is Whitelisted.', ephemeral: true });
            } else {
                await interaction.reply({ content: '⚠️ User is not Whitelisted.', ephemeral: true });
            }
        }
    }
}
