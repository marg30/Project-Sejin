import { CommandInteraction, TextChannel } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { addLogHwOptions } from '../common/commandHelper';
import { getClass } from '../api/classApi';
import { getMessageChannel } from '../api/messageChannelApi';
import { getHomeworks } from '../api/homeworkApi';
import { DateValidator } from '../common/logbook-date';
import { HomeworkLogBook } from '../common/logbook-homework';
import { ICommand } from '../types/command';

const slashCommandBuilder = new SlashCommandBuilder();
slashCommandBuilder.setName('loghw').setDescription('Log a club in the message channel.').setDefaultPermission(false);
addLogHwOptions(slashCommandBuilder);

export const logHw: ICommand = {
    config: slashCommandBuilder,
    execute: async (interaction: CommandInteraction) => {
        await interaction.deferReply();
        const { channel, client, options } = interaction;
        let startDay = options.getString('start_date');
        const startTime = options.getString('start_time');
        let endDay = options.getString('end_date');
        const endTime = options.getString('end_time');
        const classCode = options.getString('class_code');
        const desc = options.getString('description') || '';
        const hwDesc = options.getString('hw_description') || 'Assignment [number]';
        const shouldNotAllowMultipleEntries = options.getBoolean('no_multiples');

        if (classCode.length >= 7) {
            await interaction.followUp('class_code should have 6 characters.');
            return;
        }

        if (
            !DateValidator.isValidDate(endDay) ||
            !DateValidator.isValidDate(startDay) ||
            !DateValidator.isValidTime(startTime) ||
            !DateValidator.isValidTime(endTime)
        ) {
            await interaction.followUp('Please insert the correct format for dates and time (YYYY/MM/DD HH:MM)');
            return;
        }

        const periodDayTimes = DateValidator.adaptFormatOfDays(startTime, startDay, endTime, endDay);
        startDay = periodDayTimes[0];
        endDay = periodDayTimes[1];

        // Get information from the class using ClassCodeID
        const foundClass = await getClass(classCode);
        if (!foundClass) {
            await interaction.followUp(`Class code ${classCode} not found. 😞`);
            return;
        }

        // get LogBookChannelID and GuildID of main server
        const foundChannel = await getMessageChannel(channel.id);
        if (!foundChannel) {
            await interaction.followUp(`Logbook channel for channelID ${channel.id} not found. 😞`);
            return;
        }

        const messageChannelID = foundChannel.channelID;
        const messageChannelGuildID = foundChannel.guildID;
        const guild = client.guilds.cache.get(messageChannelGuildID);
        const messageChannel = guild.channels.cache.get(messageChannelID) as TextChannel;

        // Search in the db for all the homework submitted and checked during a period of time
        const homework = await getHomeworks(messageChannelID, startDay, endDay, classCode);

        const studentsByHomeworkNumber = new Map();
        const alreadyLoggedStudentIds = [];
        homework.forEach((hw) => {
            const hwNumber = hw.type;
            const studentId = hw.studentID;
            const hasStudentAlreadyBeenLogged = alreadyLoggedStudentIds.includes(studentId);
            if (shouldNotAllowMultipleEntries && hasStudentAlreadyBeenLogged) {
                return;
            }
            if (!(hwNumber in studentsByHomeworkNumber)) {
                studentsByHomeworkNumber[hwNumber] = [];
            }
            studentsByHomeworkNumber[hwNumber].push(studentId);
            alreadyLoggedStudentIds.push(studentId);
        });

        const totalHomeworks = Object.keys(studentsByHomeworkNumber).length;
        if (totalHomeworks === 0) {
            await interaction.followUp('There was no homework submitted during this time period.');
            return;
        }

        const logMessage = new HomeworkLogBook(messageChannel, foundClass, desc, totalHomeworks, hwDesc);
        logMessage.sendLogBookMessage(studentsByHomeworkNumber);
        await interaction.followUp('Logbook posted!');
    }
};