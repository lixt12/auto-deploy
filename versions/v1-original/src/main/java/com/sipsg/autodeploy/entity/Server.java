package com.sipsg.autodeploy.entity;

import javax.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "servers")
public class Server {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private String name;
    
    @Column(nullable = false)
    private String host;
    
    @Column(nullable = false)
    private Integer port = 22;
    
    @Column(nullable = false)
    private String username;
    
    private String password;
    
    @Column(name = "private_key_path")
    private String privateKeyPath;
    
    private String description;
    
    @Column(name = "connection_status")
    private String connectionStatus = "UNKNOWN"; // ONLINE, OFFLINE, UNKNOWN
    
    @Column(name = "last_check_at")
    private LocalDateTime lastCheckAt;
    
    @Column(name = "created_by")
    private Long createdBy;
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    // Constructors
    public Server() {}
    
    public Server(String name, String host, Integer port, String username) {
        this.name = name;
        this.host = host;
        this.port = port;
        this.username = username;
    }
    
    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getHost() { return host; }
    public void setHost(String host) { this.host = host; }
    
    public Integer getPort() { return port; }
    public void setPort(Integer port) { this.port = port; }
    
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    
    public String getPrivateKeyPath() { return privateKeyPath; }
    public void setPrivateKeyPath(String privateKeyPath) { this.privateKeyPath = privateKeyPath; }
    
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    
    public String getConnectionStatus() { return connectionStatus; }
    public void setConnectionStatus(String connectionStatus) { this.connectionStatus = connectionStatus; }
    
    public LocalDateTime getLastCheckAt() { return lastCheckAt; }
    public void setLastCheckAt(LocalDateTime lastCheckAt) { this.lastCheckAt = lastCheckAt; }
    
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
