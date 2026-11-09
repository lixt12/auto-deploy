package com.sipsg.autodeploy.service;

import com.sipsg.autodeploy.entity.Project;
import com.sipsg.autodeploy.repository.ProjectRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class ProjectService {
    
    @Autowired
    private ProjectRepository projectRepository;
    
    public List<Project> getAllProjects() {
        return projectRepository.findAll();
    }
    
    public Project getProjectById(Long id) {
        return projectRepository.findById(id).orElse(null);
    }
    
    public List<Project> getProjectsByUser(Long userId) {
        return projectRepository.findByCreatedByOrderByCreatedAtDesc(userId);
    }
    
    public Project createProject(Project project) {
        if (projectRepository.existsByName(project.getName())) {
            throw new RuntimeException("项目名称已存在");
        }
        
        project.setCreatedAt(LocalDateTime.now());
        return projectRepository.save(project);
    }
    
    public Project updateProject(Long id, Project projectDetails) {
        Optional<Project> projectOpt = projectRepository.findById(id);
        if (projectOpt.isPresent()) {
            Project project = projectOpt.get();
            
            // 检查名称是否重复（排除自己）
            if (!project.getName().equals(projectDetails.getName()) && 
                projectRepository.existsByName(projectDetails.getName())) {
                throw new RuntimeException("项目名称已存在");
            }
            
            project.setName(projectDetails.getName());
            project.setDescription(projectDetails.getDescription());
            project.setGitUrl(projectDetails.getGitUrl());
            project.setGitBranch(projectDetails.getGitBranch());
            project.setProjectPath(projectDetails.getProjectPath());
            project.setBuildTool(projectDetails.getBuildTool());
            project.setBuildCommand(projectDetails.getBuildCommand());
            project.setDeployPath(projectDetails.getDeployPath());
            project.setAutoDeploy(projectDetails.getAutoDeploy());
            project.setHealthCheckUrl(projectDetails.getHealthCheckUrl());
            project.setUpdatedAt(LocalDateTime.now());
            
            return projectRepository.save(project);
        }
        throw new RuntimeException("项目不存在");
    }
    
    public void deleteProject(Long id) {
        if (!projectRepository.existsById(id)) {
            throw new RuntimeException("项目不存在");
        }
        projectRepository.deleteById(id);
    }
    
    public List<Project> getAutoDeployProjects() {
        return projectRepository.findByAutoDeployTrue();
    }
}
