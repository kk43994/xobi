import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../../../data.json');

// 默认数据结构
const defaultData = {
  projects: [],
  shots: [],
  tasks: []
};

// 创建数据库实例
const adapter = new JSONFile(dbPath);
const db = new Low(adapter, defaultData);

// 初始化数据库
export async function initDB() {
  await db.read();
  db.data ||= defaultData;
  await db.write();
  console.log('Database initialized');
}

// 项目相关操作
export const projectDB = {
  async create(project) {
    await db.read();
    db.data.projects.push(project);
    await db.write();
    return project;
  },

  async getById(id) {
    await db.read();
    return db.data.projects.find(p => p.id === id);
  },

  async getAll() {
    await db.read();
    return db.data.projects.sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    );
  },

  async update(id, data) {
    await db.read();
    const index = db.data.projects.findIndex(p => p.id === id);
    if (index !== -1) {
      db.data.projects[index] = {
        ...db.data.projects[index],
        ...data,
        updated_at: new Date().toISOString()
      };
      await db.write();
    }
  },

  async delete(id) {
    await db.read();
    db.data.projects = db.data.projects.filter(p => p.id !== id);
    await db.write();
  }
};

// 分镜相关操作
export const shotDB = {
  async create(shot) {
    await db.read();
    shot.created_at = new Date().toISOString();
    shot.updated_at = new Date().toISOString();
    db.data.shots.push(shot);
    await db.write();
    return shot;
  },

  async getByProjectId(projectId) {
    await db.read();
    return db.data.shots
      .filter(s => s.project_id === projectId)
      .sort((a, b) => a.shot_number - b.shot_number);
  },

  async getById(id) {
    await db.read();
    return db.data.shots.find(s => s.id === id);
  },

  async update(id, data) {
    await db.read();
    const index = db.data.shots.findIndex(s => s.id === id);
    if (index !== -1) {
      db.data.shots[index] = {
        ...db.data.shots[index],
        ...data,
        updated_at: new Date().toISOString()
      };
      await db.write();
    }
  },

  async delete(id) {
    await db.read();
    db.data.shots = db.data.shots.filter(s => s.id !== id);
    await db.write();
  },

  async deleteByProjectId(projectId) {
    await db.read();
    db.data.shots = db.data.shots.filter(s => s.project_id !== projectId);
    await db.write();
  }
};

// 任务相关操作
export const taskDB = {
  async create(task) {
    await db.read();
    task.created_at = new Date().toISOString();
    task.updated_at = new Date().toISOString();
    db.data.tasks.push(task);
    await db.write();
    return task;
  },

  async getById(id) {
    await db.read();
    return db.data.tasks.find(t => t.id === id);
  },

  async getByYunwuTaskId(yunwuTaskId) {
    await db.read();
    return db.data.tasks.find(t => t.yunwu_task_id === yunwuTaskId);
  },

  async getByProjectId(projectId) {
    await db.read();
    return db.data.tasks
      .filter(t => t.project_id === projectId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async getPending() {
    await db.read();
    return db.data.tasks
      .filter(t => t.status === 'pending' || t.status === 'processing')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  },

  async getAll() {
    await db.read();
    return db.data.tasks
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 100);
  },

  async update(id, data) {
    await db.read();
    const index = db.data.tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      db.data.tasks[index] = {
        ...db.data.tasks[index],
        ...data,
        updated_at: new Date().toISOString()
      };
      await db.write();
    }
  }
};

export default db;
