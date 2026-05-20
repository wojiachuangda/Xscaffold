// [refactor] ID: V2-PA-INTEGRATION | Date: 2026-05-20 | Description: Project Assistant 业务层，组合 4 个 repo；前置 project 存在校验（PUT 除外）
'use strict';

const { NotFoundError } = require('../../infrastructure/errors/AppError');

async function requireProject(repos, projectId) {
    const project = await repos.projectRepository.getByProjectId(projectId);
    if (!project) {
        throw new NotFoundError(`project ${projectId} 不存在`);
    }
    return project;
}

async function listTasks(repos, filter) {
    await requireProject(repos, filter.projectId);
    return repos.taskRepository.list(filter);
}

async function upsertTask(repos, input) {
    await requireProject(repos, input.projectId);
    return repos.taskRepository.upsert(input);
}

async function listEvents(repos, projectId, page) {
    await requireProject(repos, projectId);
    return repos.eventRepository.listByProject(projectId, page);
}

async function recordEvent(repos, input) {
    await requireProject(repos, input.projectId);
    return repos.eventRepository.insert(input);
}

async function listReminders(repos, filter) {
    if (filter.projectId) {
        await requireProject(repos, filter.projectId);
    }
    return repos.reminderRepository.listDue(filter);
}

async function createReminder(repos, input) {
    await requireProject(repos, input.projectId);
    return repos.reminderRepository.insert(input);
}

/**
 * @param {{ projectRepository, taskRepository, eventRepository, reminderRepository }} repos
 */
function buildProjectAssistantService(repos) {
    return {
        listProjects: (filter) => repos.projectRepository.listAll(filter),
        getProject: (projectId) => requireProject(repos, projectId),
        updateProjectStatus: (projectId, patch) => repos.projectRepository.upsertStatus(projectId, patch),
        listTasks: (filter) => listTasks(repos, filter),
        upsertTask: (input) => upsertTask(repos, input),
        listEvents: (projectId, page) => listEvents(repos, projectId, page),
        recordEvent: (input) => recordEvent(repos, input),
        listReminders: (filter) => listReminders(repos, filter),
        createReminder: (input) => createReminder(repos, input),
    };
}

module.exports = { buildProjectAssistantService };
