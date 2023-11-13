import type { Client } from 'discordx';
import {
    Discord, Slash, SlashOption,
} from 'discordx';
import type { CommandInteraction } from 'discord.js';
import { ApplicationCommandOptionType, GuildMember } from 'discord.js';
import { Category } from '@discordx/utilities';
import { getGptWhitelist, setGptWhitelist } from '../../utils/Util.js';

@Discord()
@Category('Staff')
export class Whitelist {
    @Slash({ description: 'Manages the whitelist for the GPT module.' })
    /**
     * Manages the whitelist for the GPT module.
     * @param user - The user to whitelist
     * @param interaction - The command interaction.
     * @param client - The Discord client.
     */
    async whitelist(
    @SlashOption({
        description: 'Add',
        name: 'user',
        required: true,
        type: ApplicationCommandOptionType.User,
    })
        user: GuildMember,

        interaction: CommandInteraction,
        client: Client,
    ) {
        if (!interaction.channel) return;

        // Check if command was executed by an admin defined in the environment variable.
        const adminIds = process.env.AdminIds?.split(',');
        const isAdmin = adminIds?.some((id) => id === interaction.user.id);

        if (!isAdmin) {
            await interaction.reply({ content: '⚠️ Access Denied - This command is restricted to administrators only.', ephemeral: true });
            return;
        }

        // Command executor is an admin, add the user to the whitelist, if they are not already whitelisted.
        const getDb = await getGptWhitelist(user.id);

        // User is already whitelisted.
        if (getDb) {
            await interaction.reply({ content: '⚠️ User Already Whitelisted.', ephemeral: true });
            return;
        }

        // Update the whitelist and send a success message.
        await setGptWhitelist(user.id);
        await interaction.reply({ content: '✅ User Whitelisted - The user has been successfully added to the whitelist.', ephemeral: true });
    }
}
