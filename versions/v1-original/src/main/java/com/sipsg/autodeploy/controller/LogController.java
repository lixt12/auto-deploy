package com.sipsg.autodeploy.controller;

import com.sipsg.autodeploy.entity.SystemLog;
import com.sipsg.autodeploy.service.LogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/logs")
@CrossOrigin(origins = "*")
public class LogController {
    
    @Autowired
    private LogService logService;
    
    @GetMapping
    public ResponseEntity<?> getLogs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String targetUserId,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime) {
        try {
            Pageable pageable = PageRequest.of(page, size);
            
            Long userId = null;
            if (targetUserId != null && !targetUserId.trim().isEmpty()) {
                try {
                    userId = Long.parseLong(targetUserId);
                } catch (NumberFormatException ignored) {
                    // 如果解析失败，保持userId为null
                }
            }
            
            LocalDateTime start = null;
            LocalDateTime end = null;
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
            
            if (startTime != null && !startTime.trim().isEmpty()) {
                try {
                    start = LocalDateTime.parse(startTime, formatter);
                } catch (Exception ignored) {}
            }
            
            if (endTime != null && !endTime.trim().isEmpty()) {
                try {
                    end = LocalDateTime.parse(endTime, formatter);
                } catch (Exception ignored) {}
            }
            
            Page<SystemLog> logs = logService.getLogsByConditions(level, source, userId, start, end, pageable);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", logs.getContent());
            response.put("totalElements", logs.getTotalElements());
            response.put("totalPages", logs.getTotalPages());
            response.put("currentPage", page);
            response.put("size", size);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "获取日志失败: " + e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }
    
    @PostMapping
    public ResponseEntity<?> createLog(@RequestBody Map<String, String> request) {
        try {
            String level = request.get("level");
            String source = request.get("source");
            String message = request.get("message");
            
            SystemLog log = logService.createLog(level, source, message);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "日志创建成功");
            response.put("data", log);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "日志创建失败: " + e.getMessage());
            return ResponseEntity.status(400).body(response);
        }
    }
}
