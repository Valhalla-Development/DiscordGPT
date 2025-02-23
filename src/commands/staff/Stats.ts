import { Category } from '@discordx/utilities';
import {
    type CommandInteraction,
    EmbedBuilder,
    GuildMemberRoleManager,
    PermissionsBitField,
    codeBlock,
} from 'discord.js';
import { type Client, Discord, Slash } from 'discordx';
import { fetchAllData } from '../../utils/Util.js';

@Discord()
@Category('Staff')
export class Stats {
    @Slash({
        description: 'View the usage stags for the guild',
        defaultMemberPermissions: [PermissionsBitField.Flags.ManageMessages],
    })
    /**
     * View the usage stags for the guild.
     * @param interaction - The command interaction.
     * @param client - The Discord client.
     */
    async stats(interaction: CommandInteraction, client: Client): Promise<void> {
        // If the user is not staff, filter out the staff command menu
        const staffRoles = process.env.STAFF_ROLE_IDS?.split(',');
        const isStaff = staffRoles?.some(
            (roleID) =>
                interaction.member?.roles instanceof GuildMemberRoleManager &&
                interaction.member.roles.cache.has(roleID)
        );

        if (!isStaff) {
            await interaction.reply({
                content: '⚠️ Only a member of staff can perform this action.',
                ephemeral: true,
            });
            return;
        }

        const allData = await fetchAllData();

        if (allData instanceof Error) {
            await interaction.reply({
                content: `An error occurred.\n${codeBlock('ts', `${allData}`)}`,
                ephemeral: true,
            });
            return;
        }

        const userNamesArray: string[] = new Array(allData.top10Entries.length).fill('');
        const queriesArray: string[] = new Array(allData.top10Entries.length).fill('');

        await Promise.all(
            allData.top10Entries.map(async (data, index) => {
                if (data.userId) {
                    let fetchUser = interaction.guild!.members.cache.get(data.userId);

                    if (!fetchUser) {
                        try {
                            fetchUser = await interaction.guild!.members.fetch(data.userId);
                        } catch {
                            /* ~~ */
                        }
                    }

                    if (fetchUser) {
                        userNamesArray[index] = `\`${index + 1}\` ${fetchUser}`;
                        queriesArray[index] = `\`${data.totalQueries}\``;
                    }
                }
            })
        );

        const userNames = userNamesArray.join('\n');
        const queries = queriesArray.join('\n');

        if (!userNames || !queries) {
            await interaction.reply({ content: 'No data was found.', ephemeral: true });
            return;
        }

        const embed = new EmbedBuilder()
            .setAuthor({
                name: `${client.user?.username} Usage Stats for ${interaction.guild!.name}`,
                iconURL: `${interaction.guild!.iconURL({ extension: 'png' })}`,
            })
            .setColor(interaction.guild!.members.me!.displayHexColor)
            .setDescription(
                `**Total Queries:** \`${allData.totalQueriesSum.toLocaleString('en')}\``
            )
            .addFields(
                {
                    name: 'User',
                    value: userNames,
                    inline: true,
                },
                {
                    name: 'Queries',
                    value: queries,
                    inline: true,
                }
            );
        await interaction.reply({ embeds: [embed] });
    }
}
