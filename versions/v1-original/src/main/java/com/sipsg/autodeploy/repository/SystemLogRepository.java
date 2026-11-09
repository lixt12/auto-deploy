package com.sipsg.autodeploy.repository;

import com.sipsg.autodeploy.entity.SystemLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;

@Repository
public interface SystemLogRepository extends JpaRepository<SystemLog, Long> {
    
    Page<SystemLog> findByOrderByCreatedAtDesc(Pageable pageable);
    
    Page<SystemLog> findByLevelOrderByCreatedAtDesc(String level, Pageable pageable);
    
    Page<SystemLog> findBySourceOrderByCreatedAtDesc(String source, Pageable pageable);
    
    Page<SystemLog> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);
    
    @Query("SELECT sl FROM SystemLog sl WHERE " +
           "(:level IS NULL OR sl.level = :level) AND " +
           "(:source IS NULL OR sl.source LIKE %:source%) AND " +
           "(:userId IS NULL OR sl.userId = :userId) AND " +
           "(:startTime IS NULL OR sl.createdAt >= :startTime) AND " +
           "(:endTime IS NULL OR sl.createdAt <= :endTime) " +
           "ORDER BY sl.createdAt DESC")
    Page<SystemLog> findLogsByConditions(
        @Param("level") String level,
        @Param("source") String source,
        @Param("userId") Long userId,
        @Param("startTime") LocalDateTime startTime,
        @Param("endTime") LocalDateTime endTime,
        Pageable pageable
    );
}
