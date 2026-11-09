package com.sipsg.autodeploy.entity;

import javax.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "projects")
public class Project {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private String name;
    
    private String description;
    
    @Column(name = "git_url")
    private String gitUrl;
    
    @Column(name = "git_branch")
    private String gitBranch = "master";
    
    @Column(name = "project_path")
    private String projectPath;
    
    @Column(name = "build_tool")
    private String buildTool; // maven, gradle, npm
    
    @Column(name = "build_command")
    private String buildCommand;
    
    @Column(name = "deploy_path")
    private String deployPath;
    
    @Column(name = "auto_deploy")
    private Boolean autoDeploy = false;
    
    @Column(name = "health_check_url")
    private String healthCheckUrl;
    
    @Column(name = "created_by")
    private Long createdBy;
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    // Constructors
    public Project() {}
    
    public Project(String name, String description) {
        this.name = name;
        this.description = description;
    }
    
    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    
    public String getGitUrl() { return gitUrl; }
    public void setGitUrl(String gitUrl) { this.gitUrl = gitUrl; }
    
    public String getGitBranch() { return gitBranch; }
    public void setGitBranch(String gitBranch) { this.gitBranch = gitBranch; }
    
    public String getProjectPath() { return projectPath; }
    public void setProjectPath(String projectPath) { this.projectPath = projectPath; }
    
    public String getBuildTool() { return buildTool; }
    public void setBuildTool(String buildTool) { this.buildTool = buildTool; }
    
    public String getBuildCommand() { return buildCommand; }
    public void setBuildCommand(String buildCommand) { this.buildCommand = buildCommand; }
    
    public String getDeployPath() { return deployPath; }
    public void setDeployPath(String deployPath) { this.deployPath = deployPath; }
    
    public Boolean getAutoDeploy() { return autoDeploy; }
    public void setAutoDeploy(Boolean autoDeploy) { this.autoDeploy = autoDeploy; }
    
    public String getHealthCheckUrl() { return healthCheckUrl; }
    public void setHealthCheckUrl(String healthCheckUrl) { this.healthCheckUrl = healthCheckUrl; }
    
    public Long getCreatedBy() { return createdBy; }
    public void setCreatedBy(Long createdBy) { this.createdBy = createdBy; }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    
    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
