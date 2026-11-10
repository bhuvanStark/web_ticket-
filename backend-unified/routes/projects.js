// Project Category (V1) — project-level admin resource. Additive: this file
// does not import or modify anything from serviceRequests.js.
import express from 'express';
import { requireAdmin, requirePermission } from '../middleware/auth.js';
import {
  validateProjectId,
  validateProject,
  validateProjectUpdate,
  validateAssignActivities
} from '../middleware/validation.js';
import * as projectService from '../services/projectService.js';
import * as projectActivityService from '../services/projectActivityService.js';
import * as workspace from '../services/projectWorkspaceService.js';

const router = express.Router();
router.use(requireAdmin, requirePermission('projects'));

// GET /api/projects?tab=active|completed&search=
router.get('/', async (req, res) => {
  try {
    const { tab, search } = req.query;
    const data = await projectService.listProjects({ tab, search });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/projects/admins — Responsible-Admin dropdown source.
router.get('/admins', async (req, res) => {
  try {
    const data = await projectService.listResponsibleAdmins();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listing admins:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/projects/technicians — Managers/Team picker source (active
// technicians). Lives here so an admin with only the Projects module can
// still build a team.
router.get('/technicians', async (req, res) => {
  try {
    const data = await workspace.listAssignableTechnicians();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listing technicians for projects:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Service errors carrying an HTTP status (validation, locked, duplicate).
const sendError = (res, error, label) => {
  if (error.status) return res.status(error.status).json({ success: false, error: error.message, code: error.code });
  console.error(`Error ${label}:`, error);
  return res.status(500).json({ success: false, error: error.message });
};

// GET /api/projects/archived — projects deleted with their history, still
// restorable (see projectService.ARCHIVE_RETENTION_DAYS).
router.get('/archived', async (req, res) => {
  try {
    const data = await projectService.listArchivedProjects();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listing archived projects:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// An archived project is read-only until restored: edits, completion and
// new assignments are refused instead of silently changing hidden data.
const rejectArchived = async (req, res, next) => {
  try {
    const project = await projectService.getProjectById(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (project.archived_at) {
      return res.status(409).json({ success: false, error: 'This project is archived — restore it first' });
    }
    next();
  } catch (error) {
    console.error('Error checking project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/projects/:id
router.get('/:id', validateProjectId, async (req, res) => {
  try {
    const data = await projectService.getProjectById(req.params.id);
    if (!data) return res.status(404).json({ success: false, error: 'Project not found' });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/projects
router.post('/', validateProject, async (req, res) => {
  try {
    const actor = await workspace.loadActor(req.user);
    const data = await projectService.createProject(req.body, actor);
    res.status(201).json({ success: true, data, message: 'Project created successfully' });
  } catch (error) {
    sendError(res, error, 'creating project');
  }
});

// PATCH /api/projects/:id
router.patch('/:id', validateProjectId, rejectArchived, validateProjectUpdate, async (req, res) => {
  try {
    const actor = await workspace.loadActor(req.user);
    const data = await projectService.updateProject(req.params.id, req.body, actor);
    res.json({ success: true, data, message: 'Project updated successfully' });
  } catch (error) {
    sendError(res, error, 'updating project');
  }
});

// Completion goes through the approval flow (POST
// /api/project-workspace/:id/submit, then a Super Admin's review) — there is
// no direct "mark complete" endpoint any more.

// DELETE /api/projects/:id[?withHistory=true] — no history: deleted now.
// With history: 409 HAS_ACTIVITIES (+ activityCount) unless withHistory=true,
// which archives it for projectService.ARCHIVE_RETENTION_DAYS instead.
router.delete('/:id', validateProjectId, async (req, res) => {
  try {
    const withHistory = req.query.withHistory === 'true';
    const result = await projectService.deleteProject(req.params.id, { withHistory });
    res.json({
      success: true,
      data: result,
      message: result.archived ? 'Project archived' : 'Project deleted successfully'
    });
  } catch (error) {
    if (error.code === 'HAS_ACTIVITIES') {
      return res.status(409).json({ success: false, code: 'HAS_ACTIVITIES', error: error.message, activityCount: error.activityCount });
    }
    if (error.code === 'NOT_FOUND') return res.status(404).json({ success: false, error: error.message });
    console.error('Error deleting project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/projects/:id/restore — undo an archive within the window.
router.post('/:id/restore', validateProjectId, async (req, res) => {
  try {
    const data = await projectService.restoreProject(req.params.id);
    res.json({ success: true, data, message: 'Project restored' });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return res.status(404).json({ success: false, error: error.message });
    console.error('Error restoring project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/projects/:id/activities?scope=active|history|all
router.get('/:id/activities', validateProjectId, async (req, res) => {
  try {
    const data = await projectActivityService.listActivitiesForProject(req.params.id, { scope: req.query.scope });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listing project activities:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/projects/:id/activities — one activity per selected technician
// for one date+time, all-or-nothing. Same rules as the workspace endpoint:
// only the project's team, never while awaiting approval or completed.
router.post('/:id/activities', validateProjectId, rejectArchived, validateAssignActivities, async (req, res) => {
  try {
    const actor = await workspace.loadActor(req.user);
    const data = await workspace.assignActivities(req.params.id, req.body, actor);
    res.status(201).json({ success: true, data, message: `Assigned ${data.assigned} technician(s)` });
  } catch (error) {
    sendError(res, error, 'assigning project activities');
  }
});

export default router;
