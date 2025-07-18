// models/taskModel.js
let tasks = []; // In-memory store for now — replace with DB later

exports.createTask = async (task) => {
  tasks.push(task);
  return task;
};

exports.getAllTasks = async () => tasks;

exports.getTaskById = async (id) => tasks.find((t) => t.id === id);

exports.updateTask = async (id, updates) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;
  tasks[index] = { ...tasks[index], ...updates };
  return tasks[index];
};

exports.getTasksByTicketId = async (ticketId) =>
  tasks.filter((t) => t.ticketId === ticketId);

exports.deleteTask = async (id) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index !== -1) tasks.splice(index, 1);
};
