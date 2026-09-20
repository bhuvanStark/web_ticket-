// Project Category (V1) — project-level admin resource. Additive: this file
// does not import or modify anything from serviceRequests.js.
import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  validateProjectId,
  validateProject,
  validateProjectUpdate,
  validateAssignActivities
} from '../middleware/validation.js';
import * as projectService from '../services/projectService.js';
import * as projectActivityService from '../services/projectActivityService.js';

const router = express.Router();
router.use(requireAdmin);

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
router.patch('/:id', validateProjectId, validateProjectUpdate, async (req, res) => {
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
router.patch('/:id/complete', validateProjectId, async (req, res) => {
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

// DELETE /api/projects/:id — blocked (409) once activity history exists.
router.delete('/:id', validateProjectId, async (req, res) => {
  try {
    await projectService.deleteProject(req.params.id);
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    if (error.code === 'HAS_ACTIVITIES') {
      return res.status(409).json({ success: false, error: error.message });
    }
    console.error('Error deleting project:', error);
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
router.post('/:id/activities', validateProjectId, validateAssignActivities, async (req, res) => {
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
