// [refactor] ID: V2-PA-INTEGRATION | Date: 2026-05-20 | Description: Project Assistant 9 个 REST endpoint（GET/PUT/POST projects/tasks/events/reminders），URL :id 与 body.projectId 一致性校验
'use strict';

const express = require('express');

const { validate } = require('../../apiGateway/middlewares/validateMiddleware');
const { asyncHandler } = require('../../apiGateway/middlewares/asyncHandler');
const { success } = require('../../apiGateway/response/envelope');
const { ValidationError } = require('../../infrastructure/errors/AppError');

const {
    ListProjectsFilterSchema,
    ProjectIdParamSchema,
    UpdateProjectStatusSchema,
} = require('./schemas/projectSchema');
const { UpsertTaskSchema, ProjectTasksQuerySchema } = require('./schemas/taskSchema');
const { RecordEventSchema, EventPageQuerySchema } = require('./schemas/eventSchema');
const { CreateReminderSchema, ListProjectRemindersQuerySchema } = require('./schemas/reminderSchema');

const REMINDER_DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {ReturnType<typeof import('./projectAssistantService').buildProjectAssistantService>} service
 */
function buildProjectAssistantRouter(service) {
    const router = express.Router();

    mountProjectRoutes(router, service);
    mountTaskRoutes(router, service);
    mountEventRoutes(router, service);
    mountReminderRoutes(router, service);

    return router;
}

function mountProjectRoutes(router, service) {
    router.get(
        '/',
        validate({ query: ListProjectsFilterSchema }),
        asyncHandler(async (req, res) => {
            const { items, total } = await service.listProjects(req.query);
            res.json(success(items, { total, limit: req.query.limit, offset: req.query.offset }));
        }),
    );

    router.get(
        '/:id',
        validate({ params: ProjectIdParamSchema }),
        asyncHandler(async (req, res) => {
            res.json(success(await service.getProject(req.params.id)));
        }),
    );

    router.put(
        '/:id',
        validate({ params: ProjectIdParamSchema, body: UpdateProjectStatusSchema }),
        asyncHandler(async (req, res) => {
            assertProjectIdMatch(req);
            res.json(success(await service.updateProjectStatus(req.params.id, req.body)));
        }),
    );
}

function mountTaskRoutes(router, service) {
    router.get(
        '/:id/tasks',
        validate({ params: ProjectIdParamSchema, query: ProjectTasksQuerySchema }),
        asyncHandler(async (req, res) => {
            const filter = { ...req.query, projectId: req.params.id };
            const { items, total } = await service.listTasks(filter);
            res.json(success(items, { total, limit: filter.limit, offset: filter.offset }));
        }),
    );

    router.post(
        '/:id/tasks',
        validate({ params: ProjectIdParamSchema, body: UpsertTaskSchema }),
        asyncHandler(async (req, res) => {
            assertProjectIdMatch(req);
            res.status(201).json(success(await service.upsertTask(req.body)));
        }),
    );
}

function mountEventRoutes(router, service) {
    router.get(
        '/:id/events',
        validate({ params: ProjectIdParamSchema, query: EventPageQuerySchema }),
        asyncHandler(async (req, res) => {
            const { items, total } = await service.listEvents(req.params.id, req.query);
            res.json(success(items, { total, limit: req.query.limit, offset: req.query.offset }));
        }),
    );

    router.post(
        '/:id/events',
        validate({ params: ProjectIdParamSchema, body: RecordEventSchema }),
        asyncHandler(async (req, res) => {
            assertProjectIdMatch(req);
            res.status(201).json(success(await service.recordEvent(req.body)));
        }),
    );
}

function mountReminderRoutes(router, service) {
    router.get(
        '/:id/reminders',
        validate({ params: ProjectIdParamSchema, query: ListProjectRemindersQuerySchema }),
        asyncHandler(async (req, res) => {
            const filter = buildReminderFilter(req);
            const { items, total } = await service.listReminders(filter);
            res.json(success(items, { total, limit: filter.limit, offset: filter.offset }));
        }),
    );

    router.post(
        '/:id/reminders',
        validate({ params: ProjectIdParamSchema, body: CreateReminderSchema }),
        asyncHandler(async (req, res) => {
            assertProjectIdMatch(req);
            res.status(201).json(success(await service.createReminder(req.body)));
        }),
    );
}

function assertProjectIdMatch(req) {
    if (req.body.projectId !== req.params.id) {
        throw new ValidationError(`body.projectId (${req.body.projectId}) 必须与 URL :id (${req.params.id}) 一致`);
    }
}

function buildReminderFilter(req) {
    const before = req.query.before || new Date(Date.now() + REMINDER_DEFAULT_WINDOW_MS).toISOString();
    return {
        projectId: req.params.id,
        before,
        limit: req.query.limit,
        offset: req.query.offset,
    };
}

module.exports = { buildProjectAssistantRouter };
