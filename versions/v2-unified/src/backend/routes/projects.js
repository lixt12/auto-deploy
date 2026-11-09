const express = require('express');
const { body, validationResult } = require('express-validator');
const { execFile } = require('child_process');
const database = require('../config/database');
const authUtils = require('../utils/auth');
const logger = require('../utils/logger');

const router = express.Router();

// 中间件：验证请求数据
const validateProject = [
    body('name').notEmpty().withMessage('项目名称不能为空'),
    body('name').isLength({ max: 100 }).withMessage('项目名称不能超过100个字符'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: '请求数据验证失败',
                errors: errors.array()
            });
        }
        next();
    }
];

const validateBatchDelete = [
    body('ids').isArray({ min: 1 }).withMessage('ids must be a non-empty array'),
    body('ids').custom((ids) => {
        const isValid = Array.isArray(ids)
            && ids.length <= 500
            && ids.every(id => Number.isInteger(Number(id)) && Number(id) > 0);
        if (!isValid) {
            throw new Error('ids must be positive integers and no more than 500 items');
        }
        return true;
    }),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Request validation failed',
                errors: errors.array()
            });
        }
        return next();
    }
];

const validateGitUrl = [
    body('git_url').notEmpty().withMessage('git_url is required'),
    body('git_url').isString().withMessage('git_url must be a string'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Request validation failed',
                errors: errors.array()
            });
        }
        return next();
    }
];

function listRemoteBranches(gitUrl) {
    return new Promise((resolve, reject) => {
        execFile(
            'git',
            ['ls-remote', '--symref', gitUrl, 'HEAD', 'refs/heads/*'],
            {
                timeout: 15000,
                maxBuffer: 1024 * 1024
            },
            (error, stdout, stderr) => {
                if (error) {
                    const details = stderr || error.message || 'git command failed';
                    return reject(new Error(details));
                }

                const lines = String(stdout || '')
                    .split(/\r?\n/)
                    .map(line => line.trim())
                    .filter(Boolean);

                let defaultBranch = null;
                const branches = new Set();

                for (const line of lines) {
                    if (line.startsWith('ref: ') && line.endsWith('\tHEAD')) {
                        const refPart = line.slice(5).split('\t')[0];
                        if (refPart.startsWith('refs/heads/')) {
                            defaultBranch = refPart.replace('refs/heads/', '');
                        }
                        continue;
                    }

                    const parts = line.split('\t');
                    if (parts.length < 2) {
                        continue;
                    }

                    const ref = parts[1];
                    if (ref.startsWith('refs/heads/')) {
                        branches.add(ref.replace('refs/heads/', ''));
                    }
                }

                const list = Array.from(branches).sort((a, b) => a.localeCompare(b));
                if (!defaultBranch && list.length > 0) {
                    defaultBranch = list.includes('main')
                        ? 'main'
                        : (list.includes('master') ? 'master' : list[0]);
                }

                resolve({
                    branches: list,
                    defaultBranch
                });
            }
        );
    });
}

// 记录操作日志
async function logOperation(operation, projectName, projectId, message, userId = null) {
    try {
        await database.run(`
            INSERT INTO system_logs (level, category, operation, target_type, target_name, target_id, message, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, ['INFO', 'PROJECT', operation, 'Project', projectName, projectId, message, userId]);
    } catch (error) {
        logger.error('记录操作日志失败:', error);
    }
}

// POST /api/projects/git-branches - 获取远程仓库分支
router.post('/git-branches', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.PROJECTS_MANAGE), validateGitUrl, async (req, res) => {
    try {
        const gitUrl = String(req.body.git_url || '').trim();
        const { branches, defaultBranch } = await listRemoteBranches(gitUrl);

        res.json({
            success: true,
            data: {
                branches,
                defaultBranch
            }
        });
    } catch (error) {
        logger.error('获取远程仓库分支失败:', error);
        res.status(400).json({
            success: false,
            message: `Failed to read remote branches: ${error.message}`
        });
    }
});

// GET /api/projects - 获取所有项目
router.get('/', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.PROJECTS_VIEW), async (req, res) => {
    try {
        const projects = await database.all(`
            SELECT p.*, u.username as created_by_name
            FROM projects p
            LEFT JOIN users u ON p.created_by = u.id
            ORDER BY p.created_at DESC
        `);

        res.json({
            success: true,
            data: projects
        });
    } catch (error) {
        logger.error('获取项目列表失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
});

// GET /api/projects/:id - 获取项目详情
router.get('/:id', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.PROJECTS_VIEW), async (req, res) => {
    try {
        const { id } = req.params;
        
        const project = await database.get(`
            SELECT p.*, u.username as created_by_name
            FROM projects p
            LEFT JOIN users u ON p.created_by = u.id
            WHERE p.id = ?
        `, [id]);

        if (!project) {
            return res.status(404).json({
                success: false,
                message: '项目不存在'
            });
        }

        res.json({
            success: true,
            data: project
        });
    } catch (error) {
        logger.error('获取项目详情失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
});

// POST /api/projects - 创建项目
router.post('/', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.PROJECTS_MANAGE), validateProject, async (req, res) => {
    try {
        const {
            name,
            description,
            git_url,
            git_branch = 'master',
            project_path,
            build_tool,
            build_command,
            deploy_path,
            auto_deploy = false,
            health_check_url
        } = req.body;

        // 检查项目名称是否已存在
        const existingProject = await database.get(
            'SELECT id FROM projects WHERE name = ?',
            [name]
        );

        if (existingProject) {
            return res.status(409).json({
                success: false,
                message: '项目名称已存在'
            });
        }

        // 创建项目
        const result = await database.run(`
            INSERT INTO projects (
                name, description, git_url, git_branch, project_path,
                build_tool, build_command, deploy_path, auto_deploy,
                health_check_url, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name, description, git_url, git_branch, project_path,
            build_tool, build_command, deploy_path, auto_deploy,
            health_check_url, req.user.id
        ]);

        // 记录操作日志
        await logOperation('CREATE', name, result.id, `创建项目: ${name}`, req.user.id);

        logger.info(`用户 ${req.user.username} 创建项目: ${name}`);

        res.status(201).json({
            success: true,
            message: '项目创建成功',
            data: {
                id: result.id,
                name
            }
        });

    } catch (error) {
        logger.error('创建项目失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
});

// PUT /api/projects/:id - 更新项目
router.put('/:id', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.PROJECTS_MANAGE), validateProject, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            description,
            git_url,
            git_branch,
            project_path,
            build_tool,
            build_command,
            deploy_path,
            auto_deploy,
            health_check_url
        } = req.body;

        // 检查项目是否存在
        const existingProject = await database.get('SELECT * FROM projects WHERE id = ?', [id]);
        if (!existingProject) {
            return res.status(404).json({
                success: false,
                message: '项目不存在'
            });
        }

        // 检查名称是否重复（排除自己）
        if (existingProject.name !== name) {
            const duplicateProject = await database.get(
                'SELECT id FROM projects WHERE name = ? AND id != ?',
                [name, id]
            );

            if (duplicateProject) {
                return res.status(409).json({
                    success: false,
                    message: '项目名称已存在'
                });
            }
        }

        // 更新项目
        await database.run(`
            UPDATE projects SET
                name = ?, description = ?, git_url = ?, git_branch = ?,
                project_path = ?, build_tool = ?, build_command = ?,
                deploy_path = ?, auto_deploy = ?, health_check_url = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            name, description, git_url, git_branch,
            project_path, build_tool, build_command,
            deploy_path, auto_deploy, health_check_url, id
        ]);

        // 记录操作日志
        await logOperation('UPDATE', name, id, `更新项目: ${name}`, req.user.id);

        logger.info(`用户 ${req.user.username} 更新项目: ${name} (ID: ${id})`);

        res.json({
            success: true,
            message: '项目更新成功'
        });

    } catch (error) {
        logger.error('更新项目失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
});

// DELETE /api/projects/:id - 删除项目
router.delete('/:id', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.PROJECTS_MANAGE), async (req, res) => {
    try {
        const { id } = req.params;

        // 检查项目是否存在
        const project = await database.get('SELECT * FROM projects WHERE id = ?', [id]);
        if (!project) {
            return res.status(404).json({
                success: false,
                message: '项目不存在'
            });
        }

        // 删除项目（会级联删除相关的部署记录）
        await database.run('DELETE FROM projects WHERE id = ?', [id]);

        // 记录操作日志
        await logOperation('DELETE', project.name, id, `删除项目: ${project.name}`, req.user.id);

        logger.info(`用户 ${req.user.username} 删除项目: ${project.name} (ID: ${id})`);

        res.json({
            success: true,
            message: '项目删除成功'
        });

    } catch (error) {
        logger.error('删除项目失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
});

// POST /api/projects/batch-delete - batch delete projects
router.post('/batch-delete', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.PROJECTS_MANAGE), validateBatchDelete, async (req, res) => {
    try {
        const { ids } = req.body;
        const uniqueIds = [...new Set(ids.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0))];

        if (uniqueIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid project IDs provided'
            });
        }

        const placeholders = uniqueIds.map(() => '?').join(', ');
        const projects = await database.all(
            `SELECT id, name FROM projects WHERE id IN (${placeholders})`,
            uniqueIds
        );

        const result = await database.run(
            `DELETE FROM projects WHERE id IN (${placeholders})`,
            uniqueIds
        );

        const deletedNames = projects.map(item => item.name).join(', ') || 'N/A';
        await logOperation(
            'BATCH_DELETE',
            deletedNames,
            null,
            `批量删除项目 ${result.changes} 个`,
            req.user.id
        );

        logger.info(`User ${req.user.username} batch deleted ${result.changes} projects`);

        return res.json({
            success: true,
            message: `Deleted ${result.changes} projects`,
            data: {
                requestedCount: uniqueIds.length,
                deletedCount: result.changes
            }
        });

    } catch (error) {
        logger.error('Batch delete projects failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

module.exports = router;
