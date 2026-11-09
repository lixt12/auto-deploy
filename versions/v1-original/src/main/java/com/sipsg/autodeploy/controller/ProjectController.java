package com.sipsg.autodeploy.controller;

import com.sipsg.autodeploy.entity.Project;
import com.sipsg.autodeploy.service.ProjectService;
import com.sipsg.autodeploy.service.OperationLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/projects")
@CrossOrigin(origins = "*")
public class ProjectController {
    
    @Autowired
    private ProjectService projectService;
    
    @Autowired
    private OperationLogService operationLogService;
    
    @GetMapping
    public ResponseEntity<?> getAllProjects() {
        try {
            List<Project> projects = projectService.getAllProjects();
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", projects);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "获取项目列表失败: " + e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<?> getProject(@PathVariable Long id) {
        try {
            Project project = projectService.getProjectById(id);
            Map<String, Object> response = new HashMap<>();
            if (project != null) {
                response.put("success", true);
                response.put("data", project);
            } else {
                response.put("success", false);
                response.put("message", "项目不存在");
                return ResponseEntity.status(404).body(response);
            }
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "获取项目详情失败: " + e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }
    
    @PostMapping
    public ResponseEntity<?> createProject(@RequestBody Project project) {
        try {
            Project createdProject = projectService.createProject(project);
            
            operationLogService.logProjectOperation(
                "创建", 
                createdProject.getName(), 
                createdProject.getId(), 
                String.format("成功创建项目，项目名称: %s", createdProject.getName())
            );
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "项目创建成功");
            response.put("data", createdProject);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            operationLogService.logError("ProjectController", "创建项目", "项目名称: " + project.getName(), e);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "项目创建失败: " + e.getMessage());
            return ResponseEntity.status(400).body(response);
        }
    }
    
    @PutMapping("/{id}")
    public ResponseEntity<?> updateProject(@PathVariable Long id, @RequestBody Project project) {
        try {
            Project updatedProject = projectService.updateProject(id, project);
            
            operationLogService.logProjectOperation(
                "更新", 
                updatedProject.getName(), 
                updatedProject.getId(), 
                String.format("成功更新项目，项目ID: %s", id)
            );
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "项目更新成功");
            response.put("data", updatedProject);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            operationLogService.logError("ProjectController", "更新项目", "项目ID: " + id, e);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "项目更新失败: " + e.getMessage());
            return ResponseEntity.status(400).body(response);
        }
    }
    
    @PostMapping("/delete")
    public ResponseEntity<?> deleteProject(@RequestBody Map<String, Object> request) {
        try {
            Object idObj = request.get("id");
            if (idObj == null) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("message", "项目ID不能为空");
                return ResponseEntity.status(422).body(response);
            }
            
            Long id = Long.parseLong(idObj.toString());
            Project project = projectService.getProjectById(id);
            String projectName = project != null ? project.getName() : "项目-" + id;
            Long projectId = project != null ? project.getId() : null;
            
            projectService.deleteProject(id);
            
            operationLogService.logProjectOperation(
                "删除", 
                projectName, 
                projectId, 
                String.format("成功删除项目，项目ID: %s", id)
            );
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "项目删除成功");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            operationLogService.logError("ProjectController", "删除项目", "项目ID: " + request.get("id"), e);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "项目删除失败: " + e.getMessage());
            return ResponseEntity.status(400).body(response);
        }
    }
}
