import { fetchProjectFileBlob } from '../../../services/projectApiService';

// Saves a project file to the user's device.
export async function downloadProjectFile(projectId, file) {
  const blob = await fetchProjectFileBlob(projectId, file.id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.file_name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
