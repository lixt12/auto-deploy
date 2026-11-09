package com.sipsg.autodeploy.entity;

import javax.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "system_logs")
public class SystemLog {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private String level; // DEBUG, INFO, WARN, ERROR
    
    @Column(nullable = false)
    private String source; // 日志来源
    
    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;
    
    @Column(name = "operation_type")
    private String operationType; // CREATE, UPDATE, DELETE, TEST, DEPLOY
    
    @Column(name = "target_type")
    private String targetType; // PROJECT, SERVER, USER, DEPLOYMENT
    
    @Column(name = "target_id")
    private String targetId;
    
    @Column(name = "target_name")
    private String targetName;
    
    @Column(name = "user_id")
    private Long userId;
    
    @Column(name = "user_name")
    private String userName;
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
    
    // Constructors
    public SystemLog() {}
    
    public SystemLog(String level, String source, String message) {
        this.level = level;
        this.source = source;
        this.message = message;
    }
    
    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    
    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }
    
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    
    public String getOperationType() { return operationType; }
    public void setOperationType(String operationType) { this.operationType = operationType; }
    
    public String getTargetType() { return targetType; }
    public void setTargetType(String targetType) { this.targetType = targetType; }
    
    public String getTargetId() { return targetId; }
    public void setTargetId(String targetId) { this.targetId = targetId; }
    
    public String getTargetName() { return targetName; }
    public void setTargetName(String targetName) { this.targetName = targetName; }
    
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    
    public String getUserName() { return userName; }
    public void setUserName(String userName) { this.userName = userName; }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
