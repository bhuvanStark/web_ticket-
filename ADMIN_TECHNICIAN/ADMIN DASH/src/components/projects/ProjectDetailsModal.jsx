import React from 'react';
import { useApp } from '../../context/AppContext';
import { ProjectWorkspace } from './workspace/ProjectWorkspace';

// Opens the selected project's workspace (full screen) for admins, project
// managers and the project's view-only team alike — what each can do is
// decided by the server.
export const ProjectDetailsModal = () => {
  const { selectedProjectId, setSelectedProjectId } = useApp();
  if (!selectedProjectId) return null;
  return <ProjectWorkspace key={selectedProjectId} projectId={selectedProjectId} onClose={() => setSelectedProjectId(null)} />;
};
