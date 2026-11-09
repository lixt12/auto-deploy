package com.sipsg.autodeploy.repository;

import com.sipsg.autodeploy.entity.Deployment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DeploymentRepository extends JpaRepository<Deployment, Long> {
    
    Page<Deployment> findByOrderByCreatedAtDesc(Pageable pageable);
    
    List<Deployment> findByProjectIdOrderByCreatedAtDesc(Long projectId);
    
    List<Deployment> findByServerIdOrderByCreatedAtDesc(Long serverId);
    
    List<Deployment> findByStatusOrderByCreatedAtDesc(String status);
    
    List<Deployment> findByCreatedByOrderByCreatedAtDesc(Long createdBy);
}
