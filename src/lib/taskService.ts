import { supabase } from './supabase';
import type { Task } from '../data';
import { agents as localAgents, departments as localDepartments } from '../data';

export type DbDepartment = { id: string; slug: string; name: string };
export type DbAgent = {
  id: string;
  name: string;
  department_id: string | null;
  role: string;
  status: string;
  instructions: string | null;
};

export function mapStatus(status: string): Task['status'] {
  switch (status) {
    case 'running':
    case 'queued':
      return 'قيد التنفيذ';
    case 'awaiting_approval':
      return 'بانتظار الموافقة';
    case 'completed':
      return 'مكتملة';
    default:
      return 'جديدة';
  }
}

export function mapPriority(priority: string): Task['priority'] {
  if (priority === 'urgent' || priority === 'high') return 'عالية';
  if (priority === 'low') return 'منخفضة';
  return 'متوسطة';
}

export function toDbStatus(status: Task['status']) {
  switch (status) {
    case 'قيد التنفيذ': return 'running';
    case 'بانتظار الموافقة': return 'awaiting_approval';
    case 'مكتملة': return 'completed';
    default: return 'new';
  }
}

export function toDbPriority(priority: Task['priority']) {
  switch (priority) {
    case 'عالية': return 'high';
    case 'منخفضة': return 'low';
    default: return 'medium';
  }
}

export async function loadOrganizationTasks(organizationId: string) {
  const [tasksResult, departmentsResult, agentsResult] = await Promise.all([
    supabase.from('tasks')
      .select('id,title,department_id,agent_id,priority,status,created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false }),

    supabase.from('departments')
      .select('id,slug,name')
      .eq('organization_id', organizationId),

    supabase.from('agents')
      .select('id,name,department_id,role,status,instructions')
      .eq('organization_id', organizationId)
  ]);

  if (tasksResult.error) throw tasksResult.error;
  if (departmentsResult.error) throw departmentsResult.error;
  if (agentsResult.error) throw agentsResult.error;

  const dbDepartments = departmentsResult.data || [];
  const dbAgents = agentsResult.data || [];
  const departmentIds: Record<string, string> = {};

  for (const department of dbDepartments) {
    departmentIds[department.slug] = department.id;
  }

  const tasks: Task[] = (tasksResult.data || []).map(task => {
    const department = dbDepartments.find(d => d.id === task.department_id);
    const agent = dbAgents.find(a => a.id === task.agent_id);

    return {
      id: task.id,
      title: task.title,
      department: department?.slug || 'operations',
      assignee: agent?.name || 'غير معيّن',
      priority: mapPriority(task.priority),
      status: mapStatus(task.status),
      createdAt: new Date(task.created_at).toLocaleString('ar-DZ')
    };
  });

  return { tasks, departmentIds, departments: dbDepartments as DbDepartment[], agents: dbAgents as DbAgent[] };
}

export async function createOrganizationTask(
  organizationId: string,
  userId: string,
  title: string,
  departmentSlug: string,
  priority: Task['priority'],
  departmentIds: Record<string, string>
) {
  const departmentId = departmentIds[departmentSlug];

  if (!departmentId) {
    throw new Error('القسم غير موجود في قاعدة بيانات المؤسسة.');
  }

  const { data: matchingAgents, error: agentsError } = await supabase
    .from('agents')
    .select('id,name')
    .eq('organization_id', organizationId)
    .eq('department_id', departmentId);

  if (agentsError) throw agentsError;

  const preferredAgent = localAgents.find(a => a.department === departmentSlug);
  const matchingAgent =
    matchingAgents?.find(a => a.name === preferredAgent?.name) || matchingAgents?.[0];

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      organization_id: organizationId,
      department_id: departmentId,
      agent_id: matchingAgent?.id || null,
      created_by: userId,
      title: title.trim(),
      priority: toDbPriority(priority),
      status: 'new'
    })
    .select('id,title,department_id,agent_id,priority,status,created_at')
    .single();

  if (error) throw error;

  const department = localDepartments.find(d => d.id === departmentSlug);

  const task: Task = {
    id: data.id,
    title: data.title,
    department: departmentSlug,
    assignee: matchingAgent?.name || 'غير معيّن',
    priority: mapPriority(data.priority),
    status: mapStatus(data.status),
    createdAt: new Date(data.created_at).toLocaleString('ar-DZ')
  };

  await supabase.from('activity_logs').insert({
    organization_id: organizationId,
    actor_id: userId,
    event_type: 'task_created',
    entity_type: 'task',
    entity_id: data.id,
    details: {
      title: data.title,
      department: department?.name || departmentSlug
    }
  });

  return task;
}

export async function updateOrganizationTask(
  organizationId: string,
  taskId: string,
  status: Task['status']
) {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: toDbStatus(status),
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId)
    .eq('organization_id', organizationId)
    .select('id')
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error('لم يتم تحديث المهمة. تحقق من صلاحيات حسابك.');
  }

}
