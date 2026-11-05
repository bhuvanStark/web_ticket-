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
    const data = await projectService.createProject(req.body);
    res.status(201).json({ success: true, data, message: 'Project created successfully' });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/projects/:id
router.patch('/:id', validateProjectId, rejectArchived, validateProjectUpdate, async (req, res) => {
  try {
    const data = await projectService.updateProject(req.params.id, req.body);
    res.json({ success: true, data, message: 'Project updated successfully' });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/projects/:id/complete — admin closes the project. Blocked
// (409) while any daily activity is still Assigned/Accepted.
router.patch('/:id/complete', validateProjectId, rejectArchived, async (req, res) => {
  try {
    const data = await projectService.markProjectComplete(req.params.id);
    res.json({ success: true, data, message: 'Project marked complete' });
  } catch (error) {
    if (error.code === 'UNRESOLVED_ACTIVITIES') {
      return res.status(409).json({ success: false, error: error.message, count: error.count });
    }
    console.error('Error completing project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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

// POST /api/projects/:id/activities — bulk-create one activity per selected
// technician for one date+time. All-or-nothing: if any technician already
// has an active activity that day, the whole call is rejected (409).
router.post('/:id/activities', validateProjectId, rejectArchived, validateAssignActivities, async (req, res) => {
  try {
    const { scheduled_date, scheduled_time, technician_ids } = req.body;
    const data = await projectActivityService.createActivitiesBulk({
      project_id: req.params.id,
      scheduled_date,
      scheduled_time,
      technician_ids
    });
    res.status(201).json({ success: true, data, message: `Assigned ${data.length} technician(s)` });
  } catch (error) {
    if (error.code === 'DUPLICATE_ACTIVITY') {
      return res.status(409).json({ success: false, error: error.message });
    }
    console.error('Error assigning project activities:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
