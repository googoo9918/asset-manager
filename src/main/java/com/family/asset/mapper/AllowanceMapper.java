package com.family.asset.mapper;
import com.family.asset.dto.AllowanceRecord;
import java.util.List;
import org.apache.ibatis.annotations.*;
public interface AllowanceMapper {
 @Select("SELECT * FROM allowance_record WHERE active=true ORDER BY record_date DESC,id DESC") List<AllowanceRecord> all();
 @Select("SELECT * FROM allowance_record WHERE id=#{id}") AllowanceRecord find(Long id);
 @Select("SELECT * FROM allowance_record WHERE source_entry_id=#{id}") AllowanceRecord source(Long id);
 @Select("SELECT * FROM allowance_record WHERE request_id=CAST(#{token} AS uuid)") AllowanceRecord request(String token);
 @Select("SELECT EXISTS(SELECT 1 FROM kb_card_import WHERE entry_id=#{id})") boolean imported(Long id);
 @Insert("INSERT INTO allowance_record(owner_code,record_date,amount,memo,request_id) VALUES(#{ownerCode},#{recordDate},#{amount},#{memo},CAST(#{requestId} AS uuid))")
 @Options(useGeneratedKeys=true,keyProperty="id",keyColumn="id") void insert(AllowanceRecord row);
 @Update("UPDATE allowance_record SET owner_code=#{ownerCode},record_date=#{recordDate},amount=#{amount},memo=#{memo},updated_at=now() WHERE id=#{id} AND active=true AND source_entry_id IS NULL") int update(AllowanceRecord row);
 @Insert("INSERT INTO allowance_record(owner_code,record_date,amount,memo,source_entry_id) VALUES(#{ownerCode},#{recordDate},#{amount},#{memo},#{sourceEntryId}) ON CONFLICT(source_entry_id) DO UPDATE SET owner_code=excluded.owner_code,active=true,updated_at=now()") void link(AllowanceRecord row);
 @Update("UPDATE allowance_record SET active=false,updated_at=now() WHERE id=#{id}") void remove(Long id);
}
