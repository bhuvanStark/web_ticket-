// Project Category (V1) — actions on individual Daily Project Activities.
// Additive: does not import or modify anything from serviceRequests.js.
import express from 'express';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';
import { validateUUID, validateActivityStatusUpdate, validateActivityReassign } from '../middleware/validation.js';
import * as projectActivityService from '../services/projectActivityService.js';
import * as workspace from '../services/projectWorkspaceService.js';

const router = express.Router();

// PATCH /api/project-activities/:id/status — Assigned/Accepted/Cancelled.
// Admin is unrestricted; a technician may only touch their own activity.
// This mirrors the ticket system's generic status-PATCH precedent: there is
// no dedicated "accept" endpoint here either.
router.patch('/:id/status', requireAuth, validateUUID, validateActivityStatusUpdate, async (req, res) => {
  try {
    const data = await projectActivityService.updateActivityStatus(req.params.id, req.body.status, {
      actorRole: req.user?.role,
      actorUserId: req.user?.userId
    });
    res.json({ success: true, data, message: 'Activity status updated' });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return res.status(404).json({ success: false, error: error.message });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ success: false, error: error.message });
    if (error.code === 'INVALID_TRANSITION') return res.status(409).json({ success: false, error: error.message });
    console.error('Error updating activity status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/project-activities/:id/reassign — admin only. Cancels the
// original row and creates a new one for the replacement technician; never
// deletes the original.
// Same team rules as the workspace's reassign.
router.patch('/:id/reassign', requireAdmin, requirePermission('projects'), validateUUID, validateActivityReassign, async (req, res) => {
  try {
    const projectId = await projectActivityService.getActivityProjectId(req.params.id);
    if (!projectId) return res.status(404).json({ success: false, error: 'Activity not found' });
    const actor = await workspace.loadActor(req.user);
    const data = await workspace.reassignActivity(projectId, req.params.id, req.body.technician_id, actor);
    res.json({ success: true, data, message: 'Activity reassigned' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: error.message, code: error.code });
    console.error('Error reassigning activity:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
