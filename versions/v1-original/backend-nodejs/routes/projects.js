const express = require('express');
const { body, validationResult } = require('express-validator');
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

// 记录错误日志
async function logError(controller, operation, target, error, userId = null) {
    try {
        await database.run(`
            INSERT INTO system_logs (level, category, operation, target_type, target_name, message, details, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, ['ERROR', 'PROJECT', operation, controller, target, error.message, error.stack, userId]);
    } catch (logErr) {
        logger.error('记录错误日志失败:', logErr);
    }
}

// GET /api/projects - 获取所有项目
router.get('/', async (req, res) => {
    try {
        const projects = await database.all(`
            SELECT 
                p.*,
                u.username as created_by_name
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
            message: '获取项目列表失败: ' + error.message
        });
    }
});

// GET /api/projects/:id - 获取项目详情
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const project = await database.get(`
            SELECT 
                p.*,
                u.username as created_by_name
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
            message: '获取项目详情失败: ' + error.message
        });
    }
});

// POST /api/projects - 创建项目
router.post('/', validateProject, async (req, res) => {
    try {
        const {
            name, description, gitUrl, gitBranch = 'master',
            projectPath, buildTool, buildCommand, deployPath,
            autoDeploy = false, healthCheckUrl
        } = req.body;
        
        // 检查项目名是否已存在
        const existingProject = await database.get(
            'SELECT id FROM projects WHERE name = ?',
            [name]
        );
        
        if (existingProject) {
            return res.status(400).json({
                success: false,
                message: '项目名称已存在'
            });
        }
        
        // 创建项目
        const result = await database.run(`
            INSERT INTO projects (
                name, description, git_url, git_branch, project_path,
                build_tool, build_command, deploy_path, auto_deploy, health_check_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name, description, gitUrl, gitBranch, projectPath,
            buildTool, buildCommand, deployPath, autoDeploy, healthCheckUrl
        ]);
        
        // 获取创建的项目
        const createdProject = await database.get('SELECT * FROM projects WHERE id = ?', [result.id]);
        
        // 记录操作日志
        await logOperation('创建', name, result.id, `成功创建项目，项目名称: ${name}`);
        
        res.json({
            success: true,
            message: '项目创建成功',
            data: createdProject
        });
        
        logger.info(`项目创建成功: ${name} (ID: ${result.id})`);
        
    } catch (error) {
        logger.error('项目创建失败:', error);
        await logError('ProjectController', '创建项目', `项目名称: ${req.body.name}`, error);
        
        res.status(400).json({
            success: false,
            message: '项目创建失败: ' + error.message
        });
    }
});

// PUT /api/projects/:id - 更新项目
router.put('/:id', validateProject, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, description, gitUrl, gitBranch = 'master',
            projectPath, buildTool, buildCommand, deployPath,
            autoDeploy = false, healthCheckUrl
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
            const duplicateName = await database.get('SELECT id FROM projects WHERE name = ? AND id != ?', [name, id]);
            if (duplicateName) {
                return res.status(400).json({
                    success: false,
                    message: '项目名称已存在'
                });
            }
        }
        
        // 更新项目
        await database.run(`
            UPDATE projects SET
                name = ?, description = ?, git_url = ?, git_branch = ?,
                project_path = ?, build_tool = ?, build_command = ?, deploy_path = ?,
                auto_deploy = ?, health_check_url = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            name, description, gitUrl, gitBranch, projectPath,
            buildTool, buildCommand, deployPath, autoDeploy, healthCheckUrl, id
        ]);
        
        // 获取更新后的项目
        const updatedProject = await database.get('SELECT * FROM projects WHERE id = ?', [id]);
        
        // 记录操作日志
        await logOperation('更新', name, parseInt(id), `成功更新项目，项目ID: ${id}`);
        
        res.json({
            success: true,
            message: '项目更新成功',
            data: updatedProject
        });
        
        logger.info(`项目更新成功: ${name} (ID: ${id})`);
        
    } catch (error) {
        logger.error('项目更新失败:', error);
        await logError('ProjectController', '更新项目', `项目ID: ${req.params.id}`, error);
        
        res.status(400).json({
            success: false,
            message: '项目更新失败: ' + error.message
        });
    }
});

// POST /api/projects/delete - 删除项目 (兼容原API格式)
router.post('/delete', async (req, res) => {
    try {
        const { id } = req.body;
        
        if (!id) {
            return res.status(422).json({
                success: false,
                message: '项目ID不能为空'
            });
        }
        
        // 获取项目信息
        const project = await database.get('SELECT * FROM projects WHERE id = ?', [id]);
        const projectName = project ? project.name : `项目-${id}`;
        const projectId = project ? project.id : null;
        
        // 删除项目
        const result = await database.run('DELETE FROM projects WHERE id = ?', [id]);
        
        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: '项目不存在'
            });
        }
        
        // 记录操作日志
        await logOperation('删除', projectName, projectId, `成功删除项目，项目ID: ${id}`);
        
        res.json({
            success: true,
            message: '项目删除成功'
        });
        
        logger.info(`项目删除成功: ${projectName} (ID: ${id})`);
        
    } catch (error) {
        logger.error('项目删除失败:', error);
        await logError('ProjectController', '删除项目', `项目ID: ${req.body.id}`, error);
        
        res.status(400).json({
            success: false,
            message: '项目删除失败: ' + error.message
        });
    }
});

// DELETE /api/projects/:id - 删除项目 (标准REST API)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // 获取项目信息
        const project = await database.get('SELECT * FROM projects WHERE id = ?', [id]);
        if (!project) {
            return res.status(404).json({
                success: false,
                message: '项目不存在'
            });
        }
        
        // 删除项目
        await database.run('DELETE FROM projects WHERE id = ?', [id]);
        
        // 记录操作日志
        await logOperation('删除', project.name, project.id, `成功删除项目，项目ID: ${id}`);
        
        res.json({
            success: true,
            message: '项目删除成功'
        });
        
        logger.info(`项目删除成功: ${project.name} (ID: ${id})`);
        
    } catch (error) {
        logger.error('项目删除失败:', error);
        await logError('ProjectController', '删除项目', `项目ID: ${req.params.id}`, error);
        
        res.status(400).json({
            success: false,
            message: '项目删除失败: ' + error.message
        });
    }
});

// GET /api/projects/auto-deploy/enabled - 获取启用自动部署的项目
router.get('/auto-deploy/enabled', async (req, res) => {
    try {
        const projects = await database.all(`
            SELECT * FROM projects 
            WHERE auto_deploy = true 
            ORDER BY created_at DESC
        `);
        
        res.json({
            success: true,
            data: projects
        });
        
    } catch (error) {
        logger.error('获取自动部署项目列表失败:', error);
        res.status(500).json({
            success: false,
            message: '获取自动部署项目列表失败: ' + error.message
        });
    }
});

module.exports = router;
