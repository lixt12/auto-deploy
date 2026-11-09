package com.sipsg.autodeploy.service;

import com.sipsg.autodeploy.entity.SystemLog;
import com.sipsg.autodeploy.repository.SystemLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class OperationLogService {
    
    @Autowired
    private SystemLogRepository systemLogRepository;
    
    public void logProjectOperation(String operation, String projectName, Long projectId, String details) {
        SystemLog log = new SystemLog();
        log.setLevel("INFO");
        log.setSource("ProjectController");
        log.setMessage(String.format("项目操作: %s - %s", operation, details));
        log.setOperationType(operation);
        log.setTargetType("PROJECT");
        log.setTargetId(projectId != null ? projectId.toString() : null);
        log.setTargetName(projectName);
        
        systemLogRepository.save(log);
    }
    
    public void logServerOperation(String operation, String serverName, Long serverId, String details) {
        SystemLog log = new SystemLog();
        log.setLevel("INFO");
        log.setSource("ServerController");
        log.setMessage(String.format("服务器操作: %s - %s", operation, details));
        log.setOperationType(operation);
        log.setTargetType("SERVER");
        log.setTargetId(serverId != null ? serverId.toString() : null);
        log.setTargetName(serverName);
        
        systemLogRepository.save(log);
    }
    
    public void logDeploymentOperation(String operation, String projectName, Long deploymentId, String details) {
        SystemLog log = new SystemLog();
        log.setLevel("INFO");
        log.setSource("DeploymentController");
        log.setMessage(String.format("部署操作: %s - %s", operation, details));
        log.setOperationType(operation);
        log.setTargetType("DEPLOYMENT");
        log.setTargetId(deploymentId != null ? deploymentId.toString() : null);
        log.setTargetName(projectName);
        
        systemLogRepository.save(log);
    }
    
    public void logUserOperation(String operation, String username, Long userId, String details) {
        SystemLog log = new SystemLog();
        log.setLevel("INFO");
        log.setSource("UserController");
        log.setMessage(String.format("用户操作: %s - %s", operation, details));
        log.setOperationType(operation);
        log.setTargetType("USER");
        log.setTargetId(userId != null ? userId.toString() : null);
        log.setTargetName(username);
        
        systemLogRepository.save(log);
    }
    
    public void logOperation(String source, String operation, String targetType, String targetId, String targetName, String details) {
        SystemLog log = new SystemLog();
        log.setLevel("INFO");
        log.setSource(source);
        log.setMessage(String.format("%s: %s - %s", targetType, operation, details));
        log.setOperationType(operation);
        log.setTargetType(targetType);
        log.setTargetId(targetId);
        log.setTargetName(targetName);
        
        systemLogRepository.save(log);
    }
    
    public void logError(String source, String operation, String details, Throwable error) {
        SystemLog log = new SystemLog();
        log.setLevel("ERROR");
        log.setSource(source);
        log.setMessage(String.format("操作失败: %s - %s. 错误: %s", operation, details, error.getMessage()));
        log.setOperationType(operation);
        
        systemLogRepository.save(log);
    }
}
