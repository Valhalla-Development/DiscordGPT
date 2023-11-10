import type { Client } from 'discordx';
import {
    DApplicationCommand, Discord, MetadataStorage, SelectMenuComponent, Slash,
} from 'discordx';
import type { CommandInteraction, SelectMenuComponentOptionData, StringSelectMenuInteraction } from 'discord.js';
import { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { Category, ICategory } from '@discordx/utilities';
import { capitalise, deletableCheck, getCommandIds } from '../../utils/Util.js';

@Discord()
@Category('Miscellaneous')
export class Help {
    /**
     * Slash command to display list of commands.
     * @param interaction - The command interaction.
     * @param client - The Discord client.
     */
    @Slash({ description: 'Display list of commands.' })
    async help(interaction: CommandInteraction, client: Client) {
        if (!interaction.channel) return;

        // Create the initial embed for the message
        const embed = new EmbedBuilder()
            .setColor('#e91e63')
            .setDescription(`Hey, I'm **__${client.user?.username}__**`)
            .setAuthor({ name: `${client.user?.username} Help`, iconURL: `${interaction.guild?.iconURL()}` })
            .setThumbnail(`${client.user?.displayAvatarURL()}`)
            .setFooter({
                text: `Bot Version ${process.env.npm_package_version}`,
                iconURL: `${client.user?.avatarURL()}`,
            });

        // Fetch unique command categories
        const uniqueCategories = Array.from(new Set(
            MetadataStorage.instance.applicationCommands
                .filter((cmd: DApplicationCommand & ICategory) => cmd.category)
                .map((cmd: DApplicationCommand & ICategory) => cmd.category as string),
        ));

        // Create options for the select menu
        const cats: SelectMenuComponentOptionData[] = uniqueCategories.map((cat) => ({
            label: cat,
            value: `help-${cat.toLowerCase()}`,
        }));

        if (cats.length <= 1) {
            // If there's only one category, fetch and display commands from that category
            const selectedCategory = cats[0].value.replace(/^help-/, '').toLowerCase();
            const filteredCommands = MetadataStorage.instance.applicationCommands.filter(
                (cmd: DApplicationCommand & ICategory) => cmd.category?.toLowerCase() === selectedCategory && cmd.name?.toLowerCase() !== 'help',
            );
            const commandIds = await getCommandIds(client);
            filteredCommands.forEach((cmd) => {
                const commandId = commandIds[cmd.name];
                const commandMention = commandId ? `</${cmd.name}:${commandId}>` : capitalise(cmd.name);
                embed.addFields({
                    name: `● ${commandMention}`,
                    value: `\u200b \u200b \u200b ○ ${cmd.description}`,
                });
            });

            // Send the initial message without the select menu
            await interaction.reply({ embeds: [embed] });
        } else {
            // Create the select menu and send the initial message with it
            const row = new ActionRowBuilder<StringSelectMenuBuilder>()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('helpSelect')
                        .setPlaceholder('Nothing selected')
                        .addOptions(...cats),
                );
            await interaction.reply({ embeds: [embed], components: [row] });
        }
    }

    /**
     * Select menu component handler to display commands of a specific category.
     * @param interaction - The select menu interaction.
     * @param client - The Discord client.
     */
    @SelectMenuComponent({ id: 'helpSelect' })
    async handle(interaction: StringSelectMenuInteraction, client: Client): Promise<void> {
        // Check if the user interacting with the select menu is the command executor
        if (interaction.user.id !== interaction.message.interaction?.user.id) {
            const wrongUserMessage = new EmbedBuilder()
                .setColor('#e91e63')
                .addFields({
                    name: `**${client.user?.username} - ${capitalise(interaction.message.interaction?.commandName ?? '')}**`,
                    value: '**◎ Error:** Only the command executor can select an option!',
                });

            // Reply with an ephemeral message indicating the error
            await interaction.reply({ ephemeral: true, embeds: [wrongUserMessage] });
            return;
        }

        // Retrieve the selected value from the select menu
        const selectedValue = interaction.values?.[0];

        // Return if no value is selected
        if (!selectedValue) {
            return deletableCheck(interaction.message, 0);
        }

        // Extract the category from the selected value
        const selectedCategory = selectedValue.replace(/^help-/, '').toLowerCase();

        // Filter application commands based on the selected category
        const filteredCommands = MetadataStorage.instance.applicationCommands.filter(
            (cmd: DApplicationCommand & ICategory) => cmd.category?.toLowerCase() === selectedCategory && cmd.name?.toLowerCase() !== 'help',
        );

        // Retrieve command IDs for mentions
        const commandIds = await getCommandIds(client);

        // Create an embed to display the selected category's commands
        const embed = new EmbedBuilder()
            .setColor('#e91e63')
            .setDescription(`Hey, I'm **__${client.user?.username}__**`)
            .setAuthor({ name: `${client.user?.username} Help`, iconURL: `${interaction.guild?.iconURL()}` })
            .setThumbnail(`${client.user?.displayAvatarURL()}`)
            .setFooter({
                text: `Bot Version ${process.env.npm_package_version}`,
                iconURL: `${client.user?.avatarURL()}`,
            });

        // Add fields for each command in the selected category
        filteredCommands.forEach((cmd) => {
            const commandId = commandIds[cmd.name];
            const commandMention = commandId ? `</${cmd.name}:${commandId}>` : capitalise(cmd.name);
            embed.addFields({
                name: `● ${commandMention}`,
                value: `\u200b \u200b \u200b ○ ${cmd.description}`,
            });
        });

        // Update the interaction with the embed containing category-specific commands
        await interaction.update({ embeds: [embed] });
    }
}
