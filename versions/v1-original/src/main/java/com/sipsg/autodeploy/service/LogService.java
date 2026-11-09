package com.sipsg.autodeploy.service;

import com.sipsg.autodeploy.entity.SystemLog;
import com.sipsg.autodeploy.repository.SystemLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class LogService {
    
    @Autowired
    private SystemLogRepository systemLogRepository;
    
    public Page<SystemLog> getAllLogs(Pageable pageable) {
        return systemLogRepository.findByOrderByCreatedAtDesc(pageable);
    }
    
    public Page<SystemLog> getLogsByLevel(String level, Pageable pageable) {
        return systemLogRepository.findByLevelOrderByCreatedAtDesc(level, pageable);
    }
    
    public Page<SystemLog> getLogsBySource(String source, Pageable pageable) {
        return systemLogRepository.findBySourceOrderByCreatedAtDesc(source, pageable);
    }
    
    public Page<SystemLog> getLogsByUser(Long userId, Pageable pageable) {
        return systemLogRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable);
    }
    
    public Page<SystemLog> getLogsByConditions(
            String level, 
            String source, 
            Long userId, 
            LocalDateTime startTime, 
            LocalDateTime endTime, 
            Pageable pageable) {
        return systemLogRepository.findLogsByConditions(level, source, userId, startTime, endTime, pageable);
    }
    
    public SystemLog createLog(String level, String source, String message) {
        SystemLog log = new SystemLog(level, source, message);
        return systemLogRepository.save(log);
    }
    
    public void deleteOldLogs(LocalDateTime before) {
        // 可以添加清理旧日志的逻辑
    }
}
