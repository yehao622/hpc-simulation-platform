//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// 
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
// 
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see http://www.gnu.org/licenses/.
// 

#include "payload.h"

namespace fattreenew {

Define_Module(Payload);

void Payload::initialize()
{
    for(int i=0; i<gateSize("port$o"); i++){
        cGate* g = gate("port$o", i);
        std::string neighbor_name = g->getNextGate()->getOwnerModule()->getFullName();
        gate_to_neighbor[neighbor_name].first = "port$o";
        gate_to_neighbor[neighbor_name].second = i;
    }

    for(int i=0; i<gateSize("out"); i++){
        cGate* g = gate("out", i);
        std::string neighbor_name = g->getNextGate()->getOwnerModule()->getFullName();
        gate_to_neighbor[neighbor_name].first = "out";
        gate_to_neighbor[neighbor_name].second = i;
    }

}

void Payload::handleMessage(cMessage *msg)
{
    Request* req = check_and_cast<Request*>(msg);
    std::string from_module_name = req->getSenderModule()->getName();

    if(strcmp(getName(), "payloadOST") == 0){
        if(req->getFinished())
            toModuleName(req, getParentModule()->getName());
        else
            toModuleName(req, "flashBuffer");
    }

    else if(strcmp(getName(), "hca_payload")==0 || strcmp(getName(), "hba_payload") == 0){
        if(strcmp(from_module_name.c_str(), "hcaBuffer")==0 || strcmp(from_module_name.c_str(), "hbaBuffer")==0){
            toModuleName(req, getParentModule()->getName());
        }else{
            auto total_size(req->getByteLength());
            if(strcmp(getName(), "hca_payload") == 0){
                segAndSend(req, total_size, MTU, "hcaBuffer");
            }else if(strcmp(getName(), "hba_payload") == 0){
                segAndSend(req, total_size, STRIPE_SIZE, "hbaBuffer");
            }
        }
    }

    else if(strcmp(getName(), "oss_in_payload") == 0){
        if(!req->getFinished()){
            toModuleName(req, "oss_hub_mem_hca");
        }else{
            popPath(req, 'b');
            toModuleName(req, getParentModule()->getName());
        }
    }else if(strcmp(getName(), "oss_hub_mem_hca") == 0){
        if(strcmp(from_module_name.c_str(), "oss_in_payload")==0 ||
                strcmp(req->getSenderModule()->getParentModule()->getName(), "pci")==0){
            toModuleName(req, "hca");
        }else if(strcmp(from_module_name.c_str(), "hca_payload") == 0){ // "from_module_name" refers to the simple module name, not the network module name
            if(!req->getFinished()){
                if(req->getWork_type() == 'r')
                    toModuleName(req, "pci");
                else if(req->getWork_type() == 'w')
                    collectFromOSTs(req);
                else
                    cRuntimeError("Wrong work type!\n");
            }else{
                toModuleName(req, "oss_in_payload");
            }
        }
    }else if(strcmp(getName(), "oss_hub_mem_hba") == 0){
        toModuleName(req, "hba");
    }else if(strcmp(getName(), "oss_hub_hba_ost") == 0){
        if(strcmp(from_module_name.c_str(), "hba_payload") == 0){
            if(req->getFinished()){
                collectFromOSTs(req);
            }else{
                sendOstByStripe(req);
            }
        }else if(strcmp(req->getSenderModule()->getParentModule()->getName(), "sas") == 0){
            toModuleName(req, "oss_hub_mem_hba");
        }
    }

    else if(strcmp(getName(), "in_flow") == 0){
        if(strcmp(from_module_name.c_str(), "link_input") == 0)
            toModuleName(req, getParentModule()->getName());
        else
            toModuleName(req, "link_input");

        if(strcmp(getParentModule()->getName(), "pci") && strcmp(getParentModule()->getName(), "sas")){ // if not pci or sas cable
            if(strlen(req->getSendPath()) > 1)
                popPath(req, 's');
            else if(req->getFinished())
                popPath(req, 'b');
        }
    }else if(strcmp(getName(), "link_input") == 0){
        if(strcmp(from_module_name.c_str(), "in_flow") == 0)
            toModuleName(req, "link_output");
        else if(strcmp(from_module_name.c_str(), "link_output") == 0)
            toModuleName(req, "in_flow");
    }else if(strcmp(getName(), "link_output") == 0){
        if(strcmp(from_module_name.c_str(), "link_input") == 0)
            toModuleName(req, "out_flow");
        else if(strcmp(from_module_name.c_str(), "out_flow") == 0)
            toModuleName(req, "link_input");
    }else if(strcmp(getName(), "out_flow") == 0){
        if(strcmp(from_module_name.c_str(), "link_output") == 0)
            toModuleName(req, getParentModule()->getName());
        else
            toModuleName(req, "link_output");
    }

    else if(strcmp(getName(), "cn_memory_hca") == 0){
//        if(std::regex_match(req->getDes_addr(), std::regex("oss\\[[0-9]+\\]"))){
//            if(strcmp(req->getSenderModule()->getParentModule()->getName(), "pci")==0 ||
//                    strcmp(from_module_name.c_str(), "in_flow")==0 ||
//                    strcmp(from_module_name.c_str(), "out_flow")==0){
//                if(strcmp(req->getSenderModule()->getParentModule()->getName(), "pci")==0 && req->getWork_type()=='r'){
//                    work_arrive_status[req->getSrc_addr()][req->getMaster_id()][req->getId()] = 0;
//                }
//                toModuleName(req, "hca");
//            }else if(strcmp(from_module_name.c_str(), "hca_payload")==0) {
//                if(!req->getFinished()){
//                    popPath(req, 's');
//                    toModuleName(req, "cn");
//                }else{
//                    collectFromOSTs(req);
//                }
//            }else{
//                cRuntimeError("Please specify routing rules at %s\n", getName());
//            }
//        }else if(std::regex_match(req->getDes_addr(), std::regex("cn\\[[0-9]+\\]"))){
            if(strcmp(req->getDes_addr(), getParentModule()->getFullName())) { // if start from original CN
                if(!req->getFinished()) { //send message out
                    if(strcmp(req->getSenderModule()->getParentModule()->getName(), "pci") == 0){
                        toModuleName(req, "hca");
                    }else if(strcmp(req->getSenderModule()->getParentModule()->getName(), "hca") == 0){
                        popPath(req, 's');
                        toModuleName(req, "cn");
                    }
                }else{ // back to original CN (read request only)
                    if(strcmp(req->getSenderModule()->getParentModule()->getName(), "inif_edge_cn") == 0){
                        toModuleName(req, "hca");
                    }else if(strcmp(req->getSenderModule()->getParentModule()->getName(), "hca") == 0){
                        toModuleName(req, "pci");
                    }else if(strcmp(req->getSenderModule()->getParentModule()->getName(), "pci") == 0){
                        collectFromOSTs(req);
                    }
                }
            }else{ // arrive at target CN
                if(strcmp(req->getSenderModule()->getParentModule()->getName(), "inif_edge_cn") == 0){
                    toModuleName(req, "hca");
                }else if(strcmp(req->getSenderModule()->getParentModule()->getName(), "hca") == 0){
                    if(!req->getFinished()){
                        toModuleName(req, "pci");
                    }else{
                        popPath(req, 'b');
                        if(req->getWork_type() == 'r')
                            toModuleName(req, "cn");
                        else{
                            collectFromOSTs(req);
                        }
                    }
                }else if(strcmp(req->getSenderModule()->getParentModule()->getName(), "pci") == 0){
                    toModuleName(req, "hca");
                }
            }
//        }
    }

    else if(strcmp(getName(), "edge_connect") == 0){
        if(strlen(req->getSendPath()) > 1){
            if(strcmp(from_module_name.c_str(), "edge") == 0){
                if(req->getWork_type() == 'w'){ // write request return to sink[1], without returnning to CN
                    work_arrive_status[req->getSrc_addr()][req->getMaster_id()][req->getId()] = 0;
                }
            }
            toModuleName(req, popPath(req, 's'));
        }else if(strlen(req->getBackPath()) > 1){
            if(req->getWork_type() == 'r'){
                toModuleName(req, popPath(req, 'b'));
            }else if(req->getWork_type() == 'w')
                collectFromOSTs(req);
        }else{
            toModuleName(req, "sink[0]");
        }
    }
}

int Payload::getGateToExit() {
    int gsize = gateSize("out");
    return intuniform(0, gsize-1, par("rng").intValue());
}

void Payload::toModuleName(Request* req, const std::string m_name) {
    cGate* g;
    if(gate_to_neighbor.count(m_name)) {
        g = gate(gate_to_neighbor[m_name].first.c_str(), gate_to_neighbor[m_name].second);
        sendDelayed(req, transTimestampByCable(g)-simTime(), gate_to_neighbor[m_name].first.c_str(), gate_to_neighbor[m_name].second);
    }else{
        std::vector<std::string> m_name_vec;
        for(auto ele:gate_to_neighbor){
            if(std::regex_match(ele.first, std::regex(m_name+"\\[[0-9]+\\]"))){
                m_name_vec.push_back(ele.first);
            }
        }

        std::string chosen_m_name = m_name_vec[intuniform(0, m_name_vec.size()-1, par("rng").intValue())];
        g = gate(gate_to_neighbor[chosen_m_name].first.c_str(), gate_to_neighbor[chosen_m_name].second);
        sendDelayed(req, transTimestampByCable(g)-simTime(), gate_to_neighbor[chosen_m_name].first.c_str(), gate_to_neighbor[chosen_m_name].second);
    }
}

void Payload::collectFromOSTs(Request* req) {
    // toModuleName(req, "oss_memory");
    if(req->getWork_type() == 'r'){
        work_arrive_status[req->getSrc_addr()][req->getMaster_id()][req->getId()] += req->getFrag_size();
        if(work_arrive_status[req->getSrc_addr()][req->getMaster_id()][req->getId()] == req->getData_size()){
            if(strcmp(getParentModule()->getName(), "oss") == 0)
                req->setByteLength(req->getData_size());
            req->setFrag_size(req->getData_size());

            if(strcmp(getParentModule()->getName(), "oss") == 0){
                toModuleName(req, "oss_memory");
                work_arrive_status[req->getSrc_addr()][req->getMaster_id()].erase(req->getId());
            }else if(strcmp(getParentModule()->getName(), "cn") == 0){
                if(checkAllIdArrival(req)){
                    int64_t sum_data_size(0);
                    for(auto item : work_arrive_status[req->getSrc_addr()][req->getMaster_id()])
                        sum_data_size += item.second;
                    req->setData_size(sum_data_size);
                    req->setFrag_size(sum_data_size);
                    //req->setByteLength(sum_data_size);
                    toModuleName(req, "cn");
                    work_arrive_status[req->getSrc_addr()].erase(req->getMaster_id());
                }
            }else{
                cRuntimeError("wrong!!!!!!!!!!!!!");
            }
        }else{
            delete(req);
        }
    }else if(req->getWork_type() == 'w'){
        work_arrive_status[req->getSrc_addr()][req->getMaster_id()][req->getId()] += req->getFrag_size();
        if(work_arrive_status[req->getSrc_addr()][req->getMaster_id()][req->getId()] == req->getData_size()){
            req->setFrag_size(req->getData_size());

            if(strcmp(getParentModule()->getName(), "oss") == 0){
                if(strcmp(getName(), "oss_hub_mem_hca") == 0){
                    req->setByteLength(req->getData_size());
                    toModuleName(req, "pci");
                }else if(strcmp(getName(), "oss_hub_hba_ost") == 0){ EV << "write emerged!\n";
                    toModuleName(req, "oss_memory");
                }
                work_arrive_status[req->getSrc_addr()][req->getMaster_id()].erase(req->getId());
            }else if(strcmp(getName(), "edge_connect") == 0){
                if(checkAllIdArrival(req)){
                    int64_t sum_data_size(0);
                    for(auto item : work_arrive_status[req->getSrc_addr()][req->getMaster_id()])
                        sum_data_size += item.second;
                    req->setData_size(sum_data_size);
                    req->setFrag_size(sum_data_size);
                    toModuleName(req, "sink[1]");
                    work_arrive_status[req->getSrc_addr()].erase(req->getMaster_id());
                }
            }else if(strcmp(getParentModule()->getName(), "cn") == 0){
                if(checkAllIdArrival(req)){
                    int64_t sum_data_size(0);
                    for(auto item : work_arrive_status[req->getSrc_addr()][req->getMaster_id()])
                        sum_data_size += item.second;
                    req->setData_size(sum_data_size);
                    req->setFrag_size(sum_data_size);
                    //req->setByteLength(sum_data_size);
                    toModuleName(req, "cn");
                    work_arrive_status[req->getSrc_addr()].erase(req->getMaster_id());
                }
            }

        }else{
            delete(req);
        }
    }
}

const bool Payload::checkAllIdArrival(Request* req) {
    bool ans(true);
    // called by request that is a finished and read request in CN, or
    // called by request that is finished and write request
    if(strcmp(getName(), "cn_memory_hca")==0 || strcmp(getName(), "edge_connect")==0){
        for(auto ele : work_arrive_status[req->getSrc_addr()][req->getMaster_id()]){
            ans = ans && (ele.second == req->getData_size());
            if(!ans)
                return false;
        }
    }

    return ans;
}

void Payload::sendOstByStripe(Request* req) {
    short ost_ind = (req->getTarget_ost() + intuniform(0, STRIPE_COUNT-1, par("rng").intValue())) % getParentModule()->getSubmoduleVectorSize("ost");
    toModuleName(req, ("sas["+std::to_string(ost_ind)+"]").c_str());
}

void Payload::segAndSend(Request* req, int64_t total_size, const int seg_size, const char* dest) {
    if(total_size > seg_size){
        while(total_size > 0) {
            auto new_req = req->dup();
            if(total_size <= seg_size){
                new_req->setFrag_size(total_size);
                new_req->setByteLength(total_size);
            }else{
                new_req->setFrag_size(seg_size);
                new_req->setByteLength(seg_size);
            }
            toModuleName(new_req, dest);
            total_size -= seg_size;
        }
        delete req;
    }else{
        toModuleName(req, dest);
    }
}

} //namespace
