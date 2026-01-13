/**
 * Project storage - manages project data persistence
 */
import { JsonStore } from '../JsonStore.js';
import type { Project } from '@shared/types/index.js';

interface ProjectData {
  version: number;
  projects: Project[];
}

export class ProjectStore {
  private store: JsonStore<ProjectData>;

  constructor(filePath: string) {
    this.store = new JsonStore<ProjectData>({
      filePath,
      defaultValue: { version: 1, projects: [] },
    });
  }

  async getAll(): Promise<Project[]> {
    const data = await this.store.read();
    return data.projects;
  }

  async getById(id: string): Promise<Project | null> {
    const data = await this.store.read();
    return data.projects.find((p) => p.id === id) ?? null;
  }

  async getByPath(path: string): Promise<Project | null> {
    const data = await this.store.read();
    return data.projects.find((p) => p.path === path) ?? null;
  }

  async create(project: Project): Promise<void> {
    await this.store.update((data) => ({
      ...data,
      projects: [...data.projects, project],
    }));
  }

  async update(id: string, updates: Partial<Pick<Project, 'name'>>): Promise<Project | null> {
    let updatedProject: Project | null = null;

    await this.store.update((data) => {
      const index = data.projects.findIndex((p) => p.id === id);
      if (index === -1) {
        return data;
      }

      const project = data.projects[index];
      if (!project) {
        return data;
      }

      updatedProject = {
        ...project,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      const newProjects = [...data.projects];
      newProjects[index] = updatedProject;

      return {
        ...data,
        projects: newProjects,
      };
    });

    return updatedProject;
  }

  async delete(id: string): Promise<boolean> {
    let deleted = false;

    await this.store.update((data) => {
      const newProjects = data.projects.filter((p) => p.id !== id);
      deleted = newProjects.length < data.projects.length;
      return {
        ...data,
        projects: newProjects,
      };
    });

    return deleted;
  }
}
