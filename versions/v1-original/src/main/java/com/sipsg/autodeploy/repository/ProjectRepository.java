package com.sipsg.autodeploy.repository;

import com.sipsg.autodeploy.entity.Project;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ProjectRepository extends JpaRepository<Project, Long> {
    
    List<Project> findByCreatedByOrderByCreatedAtDesc(Long createdBy);
    
    List<Project> findByAutoDeployTrue();
    
    boolean existsByName(String name);
}
