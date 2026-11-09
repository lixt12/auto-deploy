package com.sipsg.autodeploy.entity;

import javax.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "deployments")
public class Deployment {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "project_id", nullable = false)
    private Long projectId;
    
    @Column(name = "server_id", nullable = false)
    private Long serverId;
    
    @Column(nullable = false)
    private String status = "PENDING"; // PENDING, RUNNING, SUCCESS, FAILED, CANCELLED
    
    @Column(name = "git_branch")
    private String gitBranch;
    
    @Column(name = "git_commit")
    private String gitCommit;
    
    @Column(name = "build_output", columnDefinition = "TEXT")
    private String buildOutput;
    
    @Column(name = "deploy_output", columnDefinition = "TEXT")
    private String deployOutput;
    
    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;
    
    @Column(name = "start_time", nullable = false)
    private LocalDateTime startTime = LocalDateTime.now();
    
    @Column(name = "end_time")
    private LocalDateTime endTime;
    
    @Column(name = "created_by")
    private Long createdBy;
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
    
    // Constructors
    public Deployment() {}
    
    public Deployment(Long projectId, Long serverId) {
        this.projectId = projectId;
        this.serverId = serverId;
    }
    
    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    
    public Long getProjectId() { return projectId; }
    public void setProjectId(Long projectId) { this.projectId = projectId; }
    
    public Long getServerId() { return serverId; }
    public void setServerId(Long serverId) { this.serverId = serverId; }
    
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    
    public String getGitBranch() { return gitBranch; }
    public void setGitBranch(String gitBranch) { this.gitBranch = gitBranch; }
    
    public String getGitCommit() { return gitCommit; }
    public void setGitCommit(String gitCommit) { this.gitCommit = gitCommit; }
    
    public String getBuildOutput() { return buildOutput; }
    public void setBuildOutput(String buildOutput) { this.buildOutput = buildOutput; }
    
    public String getDeployOutput() { return deployOutput; }
    public void setDeployOutput(String deployOutput) { this.deployOutput = deployOutput; }
    
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    
    public LocalDateTime getStartTime() { return startTime; }
    public void setStartTime(LocalDateTime startTime) { this.startTime = startTime; }
    
    public LocalDateTime getEndTime() { return endTime; }
    public void setEndTime(LocalDateTime endTime) { this.endTime = endTime; }
    
    public Long getCreatedBy() { return createdBy; }
    public void setCreatedBy(Long createdBy) { this.createdBy = createdBy; }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
